using System.Text;
using System.Text.RegularExpressions;

namespace SwearWordMasker;

/// <summary>
/// Dynamically constructs Unicode-aware, case-insensitive regular expressions
/// for swear word detection from a catalog of base terms.
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

    /// <summary>
    /// Builds the dynamic regex fragment for a single swear word.
    /// </summary>
    /// <param name="rawWord">Base swear word entry from the catalog.</param>
    /// <returns>The generated pattern string, or <c>null</c> when the input is blank.</returns>
    public static string? BuildWordPattern(string rawWord)
    {
        IReadOnlyList<string> tokens = TokenizeSwearWord(rawWord);
        if (tokens.Count == 0)
        {
            return null;
        }

        var builder = new StringBuilder();
        for (int index = 0; index < tokens.Count; index++)
        {
            string token = tokens[index];
            string basePattern = BuildTokenPattern(token);

            if (index == 1 && token != "-")
            {
                builder.Append("(?:")
                    .Append(basePattern)
                    .Append('|')
                    .Append(CensoredSecondLetterPattern)
                    .Append(')');
            }
            else
            {
                builder.Append(basePattern);
            }
        }

        string lastToken = tokens[^1];
        if (lastToken != "s")
        {
            builder.Append("s*");
        }

        return builder.ToString();
    }

    /// <summary>
    /// Compiles a single case-insensitive Unicode regex combining all swear words.
    /// </summary>
    /// <param name="words">Collection of swear words loaded from the catalog.</param>
    /// <returns>Compiled <see cref="Regex"/> instance.</returns>
    public static Regex BuildCombinedRegex(IEnumerable<string> words)
    {
        List<string> sortedWords = words
            .Where(word => !string.IsNullOrWhiteSpace(word))
            .Select(word => word.Trim())
            .OrderByDescending(word => TokenizeSwearWord(word).Count)
            .ThenBy(word => word, StringComparer.Ordinal)
            .ToList();

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var uniquePatterns = new List<string>();

        foreach (string word in sortedWords)
        {
            string? pattern = BuildWordPattern(word);
            if (pattern is not null && seen.Add(pattern))
            {
                uniquePatterns.Add(pattern);
            }
        }

        if (uniquePatterns.Count == 0)
        {
            throw new InvalidOperationException("No valid swear word patterns were generated.");
        }

        string combined = $"{WordBoundaryStart}(?:{string.Join("|", uniquePatterns)}){WordBoundaryEnd}";
        return new Regex(combined, RegexOptions.IgnoreCase | RegexOptions.Compiled);
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
