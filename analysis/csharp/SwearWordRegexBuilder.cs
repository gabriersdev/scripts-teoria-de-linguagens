using System.Text;
using System.Text.RegularExpressions;

namespace SwearWordMasker;

/// <summary>
/// Dynamically constructs Unicode-aware, case-insensitive regular expressions
/// for swear word detection from a catalog of base terms, using prefix-trie
/// factoring to minimize backtracking and compilation overhead.
/// </summary>
public static class SwearWordRegexBuilder
{
    private const string CensoredSecondLetterPattern = "[*#]+";
    private const string WordBoundaryStart = @"(?<![\p{L}\p{N}_])";
    private const string WordBoundaryEnd = @"(?![\p{L}\p{N}_])";
    private const string GenderPlaceholder = "[x]";

    private static readonly IReadOnlyDictionary<string, string> AccentEquivalents =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["á"] = "[aá]",
            ["à"] = "[aà]",
            ["â"] = "[aâ]",
            ["ã"] = "[aã]",
            ["ä"] = "[aä]",
            ["é"] = "[eé]",
            ["è"] = "[eè]",
            ["ê"] = "[eê]",
            ["ë"] = "[eë]",
            ["í"] = "[ií]",
            ["ì"] = "[iì]",
            ["î"] = "[iî]",
            ["ï"] = "[iï]",
            ["ó"] = "[oó]",
            ["ò"] = "[oò]",
            ["ô"] = "[oô]",
            ["õ"] = "[oõ]",
            ["ö"] = "[oö]",
            ["ú"] = "[uú]",
            ["ù"] = "[uù]",
            ["û"] = "[uû]",
            ["ü"] = "[uü]",
            ["ç"] = "[cç]"
        };

    private sealed class PatternTrieNode
    {
        public Dictionary<string, PatternTrieNode> Children { get; } = new(StringComparer.Ordinal);
        public bool IsTerminal { get; set; }
        public string TerminalSuffix { get; set; } = string.Empty;
    }

    /// <summary>
    /// Builds the dynamic regex fragment for a single swear word.
    /// </summary>
    /// <param name="rawWord">Base swear word entry from the catalog.</param>
    /// <returns>The generated pattern string, or <c>null</c> when the input is blank.</returns>
    public static string? BuildWordPattern(string rawWord)
    {
        IReadOnlyList<string> tokenPatterns = BuildWordTokenPatterns(rawWord, out string pluralSuffix);
        if (tokenPatterns.Count == 0)
        {
            return null;
        }

        return $"{string.Concat(tokenPatterns)}{pluralSuffix}";
    }

    /// <summary>
    /// Compiles a single case-insensitive Unicode regex combining all swear words
    /// into a left-factored prefix trie for fast matching.
    /// </summary>
    /// <param name="words">Collection of swear words loaded from the catalog.</param>
    /// <returns>Compiled <see cref="Regex"/> instance.</returns>
    public static Regex BuildCombinedRegex(IEnumerable<string> words)
    {
        var root = new PatternTrieNode();
        int insertedCount = 0;

        foreach (string rawWord in words)
        {
            if (string.IsNullOrWhiteSpace(rawWord))
            {
                continue;
            }

            IReadOnlyList<string> tokenPatterns = BuildWordTokenPatterns(rawWord, out string pluralSuffix);
            if (tokenPatterns.Count == 0)
            {
                continue;
            }

            InsertIntoTrie(root, tokenPatterns, pluralSuffix);
            insertedCount++;
        }

        if (insertedCount == 0)
        {
            throw new InvalidOperationException("No valid swear word patterns were generated.");
        }

        string triePattern = SerializeTrieNode(root);
        string combined = $"{WordBoundaryStart}(?:{triePattern}){WordBoundaryEnd}";

        return new Regex(combined, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static IReadOnlyList<string> BuildWordTokenPatterns(string rawWord, out string pluralSuffix)
    {
        IReadOnlyList<string> tokens = TokenizeSwearWord(rawWord);
        if (tokens.Count == 0)
        {
            pluralSuffix = string.Empty;
            return Array.Empty<string>();
        }

        var parts = new string[tokens.Count];
        for (int index = 0; index < tokens.Count; index++)
        {
            string token = tokens[index];
            string basePattern = BuildTokenPattern(token);

            parts[index] = index == 1 && token != "-"
                ? $"(?:{basePattern}|{CensoredSecondLetterPattern})"
                : basePattern;
        }

        pluralSuffix = tokens[^1] == "s" ? string.Empty : "s*";
        return parts;
    }

    private static void InsertIntoTrie(
        PatternTrieNode root,
        IReadOnlyList<string> tokenPatterns,
        string pluralSuffix)
    {
        PatternTrieNode current = root;

        foreach (string pattern in tokenPatterns)
        {
            if (!current.Children.TryGetValue(pattern, out PatternTrieNode? next))
            {
                next = new PatternTrieNode();
                current.Children[pattern] = next;
            }

            current = next;
        }

        current.IsTerminal = true;
        if (string.IsNullOrEmpty(current.TerminalSuffix))
        {
            current.TerminalSuffix = pluralSuffix;
        }
    }

    private static string SerializeTrieNode(PatternTrieNode node)
    {
        var branches = new List<string>(node.Children.Count + 1);

        foreach (KeyValuePair<string, PatternTrieNode> entry in node.Children.OrderBy(item => item.Key, StringComparer.Ordinal))
        {
            string childSuffix = SerializeTrieNode(entry.Value);
            branches.Add($"{entry.Key}{childSuffix}");
        }

        if (node.IsTerminal)
        {
            if (branches.Count == 0)
            {
                return node.TerminalSuffix;
            }

            if (string.IsNullOrEmpty(node.TerminalSuffix))
            {
                string childGroup = branches.Count == 1
                    ? $"(?:{branches[0]})?"
                    : $"(?:{string.Join("|", branches)})?";
                return childGroup;
            }

            branches.Add(node.TerminalSuffix);
        }

        if (branches.Count == 1)
        {
            return branches[0];
        }

        return $"(?:{string.Join("|", branches)})";
    }

    private static IReadOnlyList<string> TokenizeSwearWord(string rawWord)
    {
        if (string.IsNullOrWhiteSpace(rawWord))
        {
            return Array.Empty<string>();
        }

        string normalized = rawWord.Trim().ToLowerInvariant();
        Rune[] runes = normalized.EnumerateRunes().ToArray();
        var tokens = new List<string>(runes.Length);
        int index = 0;

        while (index < runes.Length)
        {
            if (index + 2 < runes.Length
                && runes[index].Value == '['
                && runes[index + 1].Value == 'x'
                && runes[index + 2].Value == ']')
            {
                tokens.Add(GenderPlaceholder);
                index += 3;
                continue;
            }

            tokens.Add(runes[index].ToString());
            index++;
        }

        return tokens;
    }

    private static string BuildTokenPattern(string token)
    {
        if (token == GenderPlaceholder)
        {
            return "[ao]+";
        }

        if (token == "-")
        {
            return "-";
        }

        if (AccentEquivalents.TryGetValue(token, out string? accentClass))
        {
            return $"{accentClass}+";
        }

        return $"{Regex.Escape(token)}+";
    }
}
