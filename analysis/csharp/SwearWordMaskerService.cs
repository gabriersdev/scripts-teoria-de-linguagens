using System.Diagnostics;
using System.Globalization;
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
/// Per-file timing and size metrics used to evaluate O(n) linearity.
/// </summary>
public sealed record FileLinearityMetric(
    string FileName,
    int Characters,
    int Bytes,
    int Matches,
    double MatchingUs,
    double NsPerChar
);

/// <summary>
/// Immutable summary of a complete masking execution run.
/// </summary>
public sealed record ExecutionSummary(
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("swearWordsLoaded")] int SwearWordsLoaded,
    [property: JsonPropertyName("filesProcessed")] int FilesProcessed,
    [property: JsonPropertyName("filesWithMatches")] int FilesWithMatches,
    [property: JsonPropertyName("totalMatches")] int TotalMatches,
    [property: JsonPropertyName("totalCharacters")] long TotalCharacters,
    [property: JsonPropertyName("totalBytes")] long TotalBytes,
    [property: JsonPropertyName("regexCompileMs")] double RegexCompileMs,
    [property: JsonPropertyName("matchingTimeMs")] double MatchingTimeMs,
    [property: JsonPropertyName("matchingTimeNs")] long MatchingTimeNs,
    [property: JsonPropertyName("elapsedMs")] double ElapsedMs,
    [property: JsonPropertyName("nsPerChar")] double NsPerChar,
    [property: JsonPropertyName("charsPerMs")] double CharsPerMs,
    [property: JsonPropertyName("throughputMBs")] double ThroughputMBs,
    [property: JsonPropertyName("pearsonCorrelationR")] double PearsonCorrelationR,
    [property: JsonPropertyName("rSquared")] double RSquared,
    [property: JsonPropertyName("outputDir")] string OutputDir
);

/// <summary>
/// Handles loading the swear word catalog, masking lyrics, computing performance metrics,
/// and writing outputs.
/// </summary>
public sealed class SwearWordMaskerService
{
    private const char MaskChar = '*';
    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    private static readonly double NanosecondsPerTick = 1_000_000_000.0 / Stopwatch.Frequency;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    /// <summary>
    /// Loads the swear word list from a JSON file containing the <c>swear-words</c> array.
    /// </summary>
    /// <param name="filePath">Absolute or relative path to <c>lib/swear-words.json</c>.</param>
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
    /// Processes all lyric text files from <paramref name="inputDir"/> and writes masked outputs,
    /// summary metrics, and per-file linearity CSV.
    /// </summary>
    public ExecutionSummary ProcessDirectory(
        string swearWordsPath,
        string inputDir,
        string outputDir,
        string summaryPath,
        string linearityCsvPath)
    {
        long totalStartTicks = Stopwatch.GetTimestamp();

        IReadOnlyList<string> swearWords = LoadSwearWords(swearWordsPath);

        long compileStartTicks = Stopwatch.GetTimestamp();
        Regex swearRegex = SwearWordRegexBuilder.BuildCombinedRegex(swearWords);
        double compileElapsedNs = (Stopwatch.GetTimestamp() - compileStartTicks) * NanosecondsPerTick;

        const string warmupSample = "puta caralho xerecão c* arrombada foda-se texto limpo de teste";
        for (int iteration = 0; iteration < 50; iteration++)
        {
            MaskText(warmupSample, swearRegex);
        }

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
        long totalCharacters = 0;
        long totalBytes = 0;
        double totalMatchingNs = 0.0;
        var linearityMetrics = new List<FileLinearityMetric>(lyricFiles.Length);

        foreach (string inputFile in lyricFiles)
        {
            byte[] rawBytes = File.ReadAllBytes(inputFile);
            string content = Encoding.UTF8.GetString(rawBytes);
            int charCount = CountUnicodeCodePoints(content);
            int byteCount = rawBytes.Length;

            long matchStartTicks = Stopwatch.GetTimestamp();
            MaskResult result = MaskText(content, swearRegex);
            double fileMatchNs = (Stopwatch.GetTimestamp() - matchStartTicks) * NanosecondsPerTick;

            totalCharacters += charCount;
            totalBytes += byteCount;
            totalMatchingNs += fileMatchNs;

            linearityMetrics.Add(new FileLinearityMetric(
                FileName: Path.GetFileName(inputFile),
                Characters: charCount,
                Bytes: byteCount,
                Matches: result.MatchCount,
                MatchingUs: fileMatchNs / 1_000.0,
                NsPerChar: charCount > 0 ? fileMatchNs / charCount : 0.0
            ));

            if (result.MatchCount > 0)
            {
                filesWithMatches++;
                totalMatches += result.MatchCount;
            }

            string outputFile = Path.Combine(outputDir, Path.GetFileName(inputFile));
            File.WriteAllText(outputFile, result.MaskedText, Utf8NoBom);
        }

        double totalElapsedMs = ((Stopwatch.GetTimestamp() - totalStartTicks) * NanosecondsPerTick) / 1_000_000.0;
        double matchingTimeMs = totalMatchingNs / 1_000_000.0;
        double nsPerChar = totalCharacters > 0 ? totalMatchingNs / totalCharacters : 0.0;
        double charsPerMs = matchingTimeMs > 0.0 ? totalCharacters / matchingTimeMs : 0.0;
        double throughputMBs = totalMatchingNs > 0.0 ? (totalBytes / totalMatchingNs) * 1_000.0 : 0.0;
        double pearsonR = ComputePearsonCorrelation(linearityMetrics);

        var summary = new ExecutionSummary(
            Language: "C#",
            SwearWordsLoaded: swearWords.Count,
            FilesProcessed: lyricFiles.Length,
            FilesWithMatches: filesWithMatches,
            TotalMatches: totalMatches,
            TotalCharacters: totalCharacters,
            TotalBytes: totalBytes,
            RegexCompileMs: Math.Round(compileElapsedNs / 1_000_000.0, 4),
            MatchingTimeMs: Math.Round(matchingTimeMs, 2),
            MatchingTimeNs: (long)Math.Round(totalMatchingNs),
            ElapsedMs: Math.Round(totalElapsedMs, 2),
            NsPerChar: Math.Round(nsPerChar, 2),
            CharsPerMs: Math.Round(charsPerMs, 2),
            ThroughputMBs: Math.Round(throughputMBs, 2),
            PearsonCorrelationR: Math.Round(pearsonR, 4),
            RSquared: Math.Round(pearsonR * pearsonR, 4),
            OutputDir: Path.GetFullPath(outputDir)
        );

        string? summaryDirectory = Path.GetDirectoryName(summaryPath);
        if (!string.IsNullOrEmpty(summaryDirectory))
        {
            Directory.CreateDirectory(summaryDirectory);
        }

        string summaryJson = JsonSerializer.Serialize(summary, JsonOptions);
        File.WriteAllText(summaryPath, $"{summaryJson}{Environment.NewLine}", Utf8NoBom);
        WriteLinearityCsv(linearityMetrics, linearityCsvPath);

        return summary;
    }

    private static int CountUnicodeCodePoints(string text)
    {
        int count = 0;
        foreach (Rune _ in text.EnumerateRunes())
        {
            count++;
        }
        return count;
    }

    private static double ComputePearsonCorrelation(IReadOnlyList<FileLinearityMetric> metrics)
    {
        int count = metrics.Count;
        if (count < 2)
        {
            return 0.0;
        }

        double sumX = 0.0;
        double sumY = 0.0;
        foreach (FileLinearityMetric metric in metrics)
        {
            sumX += metric.Characters;
            sumY += metric.MatchingUs;
        }

        double meanX = sumX / count;
        double meanY = sumY / count;

        double numerator = 0.0;
        double sumSqX = 0.0;
        double sumSqY = 0.0;

        foreach (FileLinearityMetric metric in metrics)
        {
            double dx = metric.Characters - meanX;
            double dy = metric.MatchingUs - meanY;
            numerator += dx * dy;
            sumSqX += dx * dx;
            sumSqY += dy * dy;
        }

        double denominator = Math.Sqrt(sumSqX * sumSqY);
        return denominator == 0.0 ? 0.0 : numerator / denominator;
    }

    private static void WriteLinearityCsv(IReadOnlyList<FileLinearityMetric> metrics, string csvPath)
    {
        var builder = new StringBuilder(metrics.Count * 48);
        builder.AppendLine("file,characters,bytes,matches,matching_us,ns_per_char");

        foreach (FileLinearityMetric metric in metrics)
        {
            builder.AppendLine(string.Format(
                CultureInfo.InvariantCulture,
                "{0},{1},{2},{3},{4:F2},{5:F2}",
                metric.FileName,
                metric.Characters,
                metric.Bytes,
                metric.Matches,
                metric.MatchingUs,
                metric.NsPerChar
            ));
        }

        File.WriteAllText(csvPath, builder.ToString(), Utf8NoBom);
    }
}
