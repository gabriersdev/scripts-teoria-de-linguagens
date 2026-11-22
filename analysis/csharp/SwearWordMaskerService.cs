using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace SwearWordMasker;

/// <summary>
/// Immutable result of masking a single lyric text.
/// </summary>
public sealed record MaskResult(string MaskedText, int MatchCount);

/// <summary>
/// Immutable summary of a complete masking execution run.
/// </summary>
public sealed record ExecutionSummary(
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("swearWordsLoaded")] int SwearWordsLoaded,
    [property: JsonPropertyName("filesProcessed")] int FilesProcessed,
    [property: JsonPropertyName("filesWithMatches")] int FilesWithMatches,
    [property: JsonPropertyName("totalMatches")] int TotalMatches,
    [property: JsonPropertyName("elapsedMs")] double ElapsedMs,
    [property: JsonPropertyName("outputDir")] string OutputDir
);

/// <summary>
/// Handles loading the swear word catalog, masking lyrics, and writing outputs.
/// </summary>
public sealed class SwearWordMaskerService
{
    private const char MaskChar = '*';
    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    /// <summary>
    /// Loads the swear word list from a JSON file containing the {@code swear-words} array.
    /// </summary>
    /// <param name="filePath">Absolute or relative path to {@code lib/swear-words.json}.</param>
    /// <returns>Read-only list of swear words.</returns>
    public IReadOnlyList<string> LoadSwearWords(string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Swear words file not found: {filePath}", filePath);
        }

        string rawJson = File.ReadAllText(filePath, Encoding.UTF8);
        using JsonDocument document = JsonDocument.Parse(rawJson);

        JsonElement arrayElement = document.RootElement.ValueKind == JsonValueKind.Array
            ? document.RootElement
            : document.RootElement.GetProperty("swear-words");

        var words = new List<string>();
        foreach (JsonElement item in arrayElement.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                string? value = item.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    words.Add(value);
                }
            }
        }

        return words;
    }

    /// <summary>
    /// Masks a matched swear word keeping its first Unicode scalar value and replacing the rest with <c>*</c>.
    /// </summary>
    /// <param name="term">Matched term.</param>
    /// <returns>Masked representation of the term.</returns>
    public string MaskMatchedTerm(string term)
    {
        Rune[] runes = term.EnumerateRunes().ToArray();
        if (runes.Length <= 1)
        {
            return term;
        }

        return $"{runes[0]}{new string(MaskChar, runes.Length - 1)}";
    }

    /// <summary>
    /// Finds and masks all swear word occurrences in the supplied text.
    /// </summary>
    /// <param name="text">Input lyric content.</param>
    /// <param name="swearRegex">Compiled swear word regex.</param>
    /// <returns>Masking result containing the transformed text and match count.</returns>
    public MaskResult MaskText(string text, Regex swearRegex)
    {
        int matchCount = 0;
        string maskedText = swearRegex.Replace(text, match =>
        {
            matchCount++;
            return MaskMatchedTerm(match.Value);
        });

        return new MaskResult(maskedText, matchCount);
    }

    /// <summary>
    /// Processes all lyric text files from <paramref name="inputDir"/> and writes masked outputs to <paramref name="outputDir"/>.
    /// </summary>
    public ExecutionSummary ProcessDirectory(
        string swearWordsPath,
        string inputDir,
        string outputDir,
        string summaryPath)
    {
        var stopwatch = Stopwatch.StartNew();

        IReadOnlyList<string> swearWords = LoadSwearWords(swearWordsPath);
        Regex swearRegex = SwearWordRegexBuilder.BuildCombinedRegex(swearWords);

        if (!Directory.Exists(inputDir))
        {
            throw new DirectoryNotFoundException($"Input lyrics directory not found: {inputDir}");
        }

        Directory.CreateDirectory(outputDir);

        string[] lyricFiles = Directory.GetFiles(inputDir, "*.txt", SearchOption.TopDirectoryOnly)
            .OrderBy(path => Path.GetFileName(path), StringComparer.Ordinal)
            .ToArray();

        int filesWithMatches = 0;
        int totalMatches = 0;

        foreach (string inputFile in lyricFiles)
        {
            string content = File.ReadAllText(inputFile, Encoding.UTF8);
            MaskResult result = MaskText(content, swearRegex);

            if (result.MatchCount > 0)
            {
                filesWithMatches++;
                totalMatches += result.MatchCount;
            }

            string outputFile = Path.Combine(outputDir, Path.GetFileName(inputFile));
            File.WriteAllText(outputFile, result.MaskedText, Utf8NoBom);
        }

        stopwatch.Stop();

        var summary = new ExecutionSummary(
            Language: "C#",
            SwearWordsLoaded: swearWords.Count,
            FilesProcessed: lyricFiles.Length,
            FilesWithMatches: filesWithMatches,
            TotalMatches: totalMatches,
            ElapsedMs: Math.Round(stopwatch.Elapsed.TotalMilliseconds, 2),
            OutputDir: Path.GetFullPath(outputDir)
        );

        string? summaryDirectory = Path.GetDirectoryName(summaryPath);
        if (!string.IsNullOrEmpty(summaryDirectory))
        {
            Directory.CreateDirectory(summaryDirectory);
        }

        string summaryJson = JsonSerializer.Serialize(summary, JsonOptions);
        File.WriteAllText(summaryPath, $"{summaryJson}{Environment.NewLine}", Utf8NoBom);

        return summary;
    }
}
