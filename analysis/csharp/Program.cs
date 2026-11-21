using System.Globalization;

namespace SwearWordMasker;

/// <summary>
/// Application entry point for the C# swear word detection and masking script.
/// </summary>
public static class Program
{
    /// <summary>
    /// Executes the swear word masking pipeline and prints the execution summary.
    /// </summary>
    public static int Main()
    {
        try
        {
            string baseDir = ResolveBaseDir();
            string swearWordsPath = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "lib", "swear-words.json"));
            string inputDir = Path.GetFullPath(Path.Combine(baseDir, "input", "lyrics-data", "lyrics"));
            string outputDir = Path.GetFullPath(Path.Combine(baseDir, "output", "lyrics"));
            string summaryPath = Path.GetFullPath(Path.Combine(baseDir, "output", "summary.json"));

            var service = new SwearWordMaskerService();
            ExecutionSummary summary = service.ProcessDirectory(
                swearWordsPath,
                inputDir,
                outputDir,
                summaryPath
            );

            Console.WriteLine("[C#] Swear word masking completed.");
            Console.WriteLine($"  Swear words loaded : {summary.SwearWordsLoaded}");
            Console.WriteLine($"  Files processed    : {summary.FilesProcessed}");
            Console.WriteLine($"  Files with matches : {summary.FilesWithMatches}");
            Console.WriteLine($"  Total matches      : {summary.TotalMatches}");
            Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "  Elapsed time (ms)  : {0:F2}", summary.ElapsedMs));
            Console.WriteLine($"  Output directory   : {summary.OutputDir}");

            return 0;
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            Console.Error.WriteLine($"[C#] Execution failed: {exception.Message}");
            return 1;
        }
    }

    private static string ResolveBaseDir()
    {
        string currentDir = Directory.GetCurrentDirectory();
        if (Directory.Exists(Path.Combine(currentDir, "input", "lyrics-data", "lyrics")))
        {
            return currentDir;
        }

        string nestedDir = Path.Combine(currentDir, "analysis", "csharp");
        if (Directory.Exists(Path.Combine(nestedDir, "input", "lyrics-data", "lyrics")))
        {
            return nestedDir;
        }

        return currentDir;
    }
}
