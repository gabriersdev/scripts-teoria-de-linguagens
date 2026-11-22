import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Identifies and masks swear words in lyric files using dynamically compiled
 * Unicode-aware, case-insensitive regular expressions loaded from {@code lib/swear-words.json}.
 */
public final class SwearWordMasker {

    private static final char MASK_CHAR = '*';
    private static final String CENSORED_SECOND_LETTER_PATTERN = "[*#]+";
    private static final String WORD_BOUNDARY_START = "(?<![\\p{L}\\p{N}_])";
    private static final String WORD_BOUNDARY_END = "(?![\\p{L}\\p{N}_])";
    private static final String GENDER_PLACEHOLDER = "[x]";
    private static final String REGEX_META_CHARS = ".*+?^${}()|[]\\";
    private static final Pattern JSON_STRING_PATTERN = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"");

    private static final Map<String, String> ACCENT_EQUIVALENTS = Map.ofEntries(
        Map.entry("á", "[aá]"),
        Map.entry("à", "[aà]"),
        Map.entry("â", "[aâ]"),
        Map.entry("ã", "[aã]"),
        Map.entry("ä", "[aä]"),
        Map.entry("é", "[eé]"),
        Map.entry("è", "[eè]"),
        Map.entry("ê", "[eê]"),
        Map.entry("ë", "[eë]"),
        Map.entry("í", "[ií]"),
        Map.entry("ì", "[iì]"),
        Map.entry("î", "[iî]"),
        Map.entry("ï", "[iï]"),
        Map.entry("ó", "[oó]"),
        Map.entry("ò", "[oò]"),
        Map.entry("ô", "[oô]"),
        Map.entry("õ", "[oõ]"),
        Map.entry("ö", "[oö]"),
        Map.entry("ú", "[uú]"),
        Map.entry("ù", "[uù]"),
        Map.entry("û", "[uû]"),
        Map.entry("ü", "[uü]"),
        Map.entry("ç", "[cç]")
    );

    /**
     * Immutable result of masking a single lyric text.
     */
    public record MaskResult(String maskedText, int matchCount) {
    }

    /**
     * Per-file timing and size metrics used to evaluate O(n) linearity.
     */
    public record FileLinearityMetric(
        String fileName,
        int characters,
        int bytes,
        int matches,
        double matchingUs,
        double nsPerChar
    ) {
    }

    /**
     * Immutable summary of an execution run.
     */
    public record ExecutionSummary(
        String language,
        int swearWordsLoaded,
        int filesProcessed,
        int filesWithMatches,
        int totalMatches,
        long totalCharacters,
        long totalBytes,
        double regexCompileMs,
        double matchingTimeMs,
        long matchingTimeNs,
        double elapsedMs,
        double nsPerChar,
        double charsPerMs,
        double throughputMBs,
        double pearsonCorrelationR,
        double rSquared,
        String outputDir
    ) {
    }

    private static final class PatternTrieNode {
        private final Map<String, PatternTrieNode> children = new TreeMap<>();
        private boolean terminal;
        private String terminalSuffix = "";
    }

    private record WordPatternParts(List<String> tokenPatterns, String pluralSuffix) {
    }

    private SwearWordMasker() {
    }

    /**
     * Entry point for running swear word detection and masking over {@code input/lyrics-data/lyrics}.
     *
     * @param args optional CLI arguments (unused)
     */
    public static void main(String[] args) {
        try {
            runMasking();
        } catch (IOException | IllegalStateException exception) {
            System.err.println("[Java] Execution failed: " + exception.getMessage());
            System.exit(1);
        }
    }

    /**
     * Executes the full load, compile, mask, benchmark, and persist pipeline.
     *
     * @throws IOException if reading inputs or writing outputs fails
     */
    public static void runMasking() throws IOException {
        long totalStartNanos = System.nanoTime();

        Path baseDir = resolveBaseDir();
        Path swearWordsPath = baseDir.resolve("../../lib/swear-words.json").normalize();
        Path inputDir = baseDir.resolve("input/lyrics-data/lyrics").normalize();
        Path outputDir = baseDir.resolve("output/lyrics").normalize();
        Path summaryPath = baseDir.resolve("output/summary.json").normalize();
        Path linearityCsvPath = baseDir.resolve("output/linearity-metrics.csv").normalize();

        List<String> swearWords = loadSwearWords(swearWordsPath);

        long compileStartNanos = System.nanoTime();
        Pattern swearPattern = buildSwearWordsPattern(swearWords);
        long compileElapsedNanos = System.nanoTime() - compileStartNanos;

        String warmupSample = "puta caralho xerecão c* arrombada foda-se texto limpo de teste";
        for (int iteration = 0; iteration < 50; iteration++) {
            maskText(warmupSample, swearPattern);
        }

        Files.createDirectories(outputDir);

        List<Path> lyricFiles = listLyricFiles(inputDir);
        int filesWithMatches = 0;
        int totalMatches = 0;
        long totalCharacters = 0;
        long totalBytes = 0;
        long totalMatchingNanos = 0;
        List<FileLinearityMetric> linearityMetrics = new ArrayList<>(lyricFiles.size());

        for (Path inputFile : lyricFiles) {
            byte[] rawBytes = Files.readAllBytes(inputFile);
            String content = new String(rawBytes, StandardCharsets.UTF_8);
            int charCount = content.codePointCount(0, content.length());
            int byteCount = rawBytes.length;

            long matchStartNanos = System.nanoTime();
            MaskResult result = maskText(content, swearPattern);
            long fileMatchNanos = System.nanoTime() - matchStartNanos;

            totalCharacters += charCount;
            totalBytes += byteCount;
            totalMatchingNanos += fileMatchNanos;

            linearityMetrics.add(new FileLinearityMetric(
                inputFile.getFileName().toString(),
                charCount,
                byteCount,
                result.matchCount(),
                fileMatchNanos / 1_000.0,
                charCount > 0 ? (double) fileMatchNanos / charCount : 0.0
            ));

            if (result.matchCount() > 0) {
                filesWithMatches++;
                totalMatches += result.matchCount();
            }

            Path outputFile = outputDir.resolve(inputFile.getFileName());
            Files.writeString(outputFile, result.maskedText(), StandardCharsets.UTF_8);
        }

        double totalElapsedMs = (System.nanoTime() - totalStartNanos) / 1_000_000.0;
        double matchingTimeMs = totalMatchingNanos / 1_000_000.0;
        double nsPerChar = totalCharacters > 0 ? (double) totalMatchingNanos / totalCharacters : 0.0;
        double charsPerMs = matchingTimeMs > 0.0 ? totalCharacters / matchingTimeMs : 0.0;
        double throughputMBs = totalMatchingNanos > 0 ? ((double) totalBytes / totalMatchingNanos) * 1_000.0 : 0.0;
        double pearsonR = computePearsonCorrelation(linearityMetrics);

        ExecutionSummary summary = new ExecutionSummary(
            "Java",
            swearWords.size(),
            lyricFiles.size(),
            filesWithMatches,
            totalMatches,
            totalCharacters,
            totalBytes,
            roundTo(compileElapsedNanos / 1_000_000.0, 4),
            roundTo(matchingTimeMs, 2),
            totalMatchingNanos,
            roundTo(totalElapsedMs, 2),
            roundTo(nsPerChar, 2),
            roundTo(charsPerMs, 2),
            roundTo(throughputMBs, 2),
            roundTo(pearsonR, 4),
            roundTo(pearsonR * pearsonR, 4),
            outputDir.toAbsolutePath().toString()
        );

        writeSummary(summary, summaryPath);
        writeLinearityCsv(linearityMetrics, linearityCsvPath);

        System.out.println("[Java] Swear word masking completed.");
        System.out.println("  Swear words loaded  : " + summary.swearWordsLoaded());
        System.out.println("  Files processed     : " + summary.filesProcessed());
        System.out.println("  Files with matches  : " + summary.filesWithMatches());
        System.out.println("  Total matches       : " + summary.totalMatches());
        System.out.println("  Total characters    : " + summary.totalCharacters());
        System.out.printf(Locale.US, "  Regex compile (ms)  : %.4f%n", summary.regexCompileMs());
        System.out.printf(Locale.US, "  Pure matching (ms)  : %.2f%n", summary.matchingTimeMs());
        System.out.printf(Locale.US, "  Elapsed time (ms)   : %.2f%n", summary.elapsedMs());
        System.out.printf(Locale.US, "  Time/char (ns/char) : %.2f%n", summary.nsPerChar());
        System.out.printf(Locale.US, "  Throughput (ch/ms)  : %.2f%n", summary.charsPerMs());
        System.out.printf(Locale.US, "  Throughput (MB/s)   : %.2f%n", summary.throughputMBs());
        System.out.printf(Locale.US, "  Linearity r / R^2   : %.4f / %.4f%n", summary.pearsonCorrelationR(), summary.rSquared());
        System.out.println("  Output directory    : " + summary.outputDir());
    }

    /**
     * Builds the dynamic regex fragment for a single swear word.
     *
     * @param rawWord swear word entry from the catalog
     * @return regex pattern string, or {@code null} if blank
     */
    public static String buildWordPattern(String rawWord) {
        WordPatternParts parts = buildWordTokenPatterns(rawWord);
        if (parts.tokenPatterns().isEmpty()) {
            return null;
        }

        return String.join("", parts.tokenPatterns()) + parts.pluralSuffix();
    }

    /**
     * Compiles a single Unicode-aware, case-insensitive pattern combining all swear words
     * into a left-factored prefix trie to minimize NFA backtracking.
     *
     * @param words catalog of swear words
     * @return compiled {@link Pattern}
     */
    public static Pattern buildSwearWordsPattern(List<String> words) {
        PatternTrieNode root = new PatternTrieNode();
        int insertedCount = 0;

        for (String word : words) {
            if (word == null || word.trim().isEmpty()) {
                continue;
            }

            WordPatternParts parts = buildWordTokenPatterns(word);
            if (parts.tokenPatterns().isEmpty()) {
                continue;
            }

            insertIntoTrie(root, parts);
            insertedCount++;
        }

        if (insertedCount == 0) {
            throw new IllegalStateException("No valid swear word patterns were generated.");
        }

        String triePattern = serializeTrieNode(root);
        String combined = WORD_BOUNDARY_START + "(?:" + triePattern + ")" + WORD_BOUNDARY_END;
        return Pattern.compile(combined, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    }

    /**
     * Masks a matched swear word keeping the first code point and replacing the rest with {@code *}.
     *
     * @param term matched text
     * @return masked text
     */
    public static String maskMatchedTerm(String term) {
        int[] codePoints = term.codePoints().toArray();
        if (codePoints.length <= 1) {
            return term;
        }

        StringBuilder builder = new StringBuilder(codePoints.length);
        builder.appendCodePoint(codePoints[0]);
        for (int index = 1; index < codePoints.length; index++) {
            builder.append(MASK_CHAR);
        }
        return builder.toString();
    }

    /**
     * Finds and masks all occurrences of the compiled swear pattern in {@code text}.
     *
     * @param text    input lyric content
     * @param pattern compiled swear words pattern
     * @return {@link MaskResult} containing masked text and match count
     */
    public static MaskResult maskText(String text, Pattern pattern) {
        Matcher matcher = pattern.matcher(text);
        StringBuilder output = new StringBuilder(text.length());
        int matchCount = 0;

        while (matcher.find()) {
            matchCount++;
            String replacement = maskMatchedTerm(matcher.group());
            matcher.appendReplacement(output, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(output);

        return new MaskResult(output.toString(), matchCount);
    }

    private static WordPatternParts buildWordTokenPatterns(String rawWord) {
        List<String> tokens = tokenizeSwearWord(rawWord);
        if (tokens.isEmpty()) {
            return new WordPatternParts(List.of(), "");
        }

        List<String> tokenPatterns = new ArrayList<>(tokens.size());
        for (int index = 0; index < tokens.size(); index++) {
            String token = tokens.get(index);
            String basePattern = buildTokenPattern(token);

            if (index == 1 && !"-".equals(token)) {
                tokenPatterns.add("(?:" + basePattern + "|" + CENSORED_SECOND_LETTER_PATTERN + ")");
            } else {
                tokenPatterns.add(basePattern);
            }
        }

        String lastToken = tokens.get(tokens.size() - 1);
        String pluralSuffix = "s".equals(lastToken) ? "" : "s*";
        return new WordPatternParts(tokenPatterns, pluralSuffix);
    }

    private static void insertIntoTrie(PatternTrieNode root, WordPatternParts parts) {
        PatternTrieNode current = root;

        for (String tokenPattern : parts.tokenPatterns()) {
            current = current.children.computeIfAbsent(tokenPattern, ignored -> new PatternTrieNode());
        }

        current.terminal = true;
        if (current.terminalSuffix.isEmpty()) {
            current.terminalSuffix = parts.pluralSuffix();
        }
    }

    private static String serializeTrieNode(PatternTrieNode node) {
        List<String> branches = new ArrayList<>(node.children.size() + 1);

        for (Map.Entry<String, PatternTrieNode> entry : node.children.entrySet()) {
            String childSuffix = serializeTrieNode(entry.getValue());
            branches.add(entry.getKey() + childSuffix);
        }

        if (node.terminal) {
            if (branches.isEmpty()) {
                return node.terminalSuffix;
            }

            if (node.terminalSuffix.isEmpty()) {
                return branches.size() == 1
                    ? "(?:" + branches.get(0) + ")?"
                    : "(?:" + String.join("|", branches) + ")?";
            }

            branches.add(node.terminalSuffix);
        }

        if (branches.size() == 1) {
            return branches.get(0);
        }

        return "(?:" + String.join("|", branches) + ")";
    }

    private static List<String> tokenizeSwearWord(String rawWord) {
        if (rawWord == null) {
            return List.of();
        }

        String normalized = rawWord.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return List.of();
        }

        int[] codePoints = normalized.codePoints().toArray();
        List<String> tokens = new ArrayList<>(codePoints.length);
        int index = 0;

        while (index < codePoints.length) {
            if (index + 2 < codePoints.length
                && codePoints[index] == '['
                && codePoints[index + 1] == 'x'
                && codePoints[index + 2] == ']') {
                tokens.add(GENDER_PLACEHOLDER);
                index += 3;
                continue;
            }

            tokens.add(new String(Character.toChars(codePoints[index])));
            index++;
        }

        return tokens;
    }

    private static String buildTokenPattern(String token) {
        if (GENDER_PLACEHOLDER.equals(token)) {
            return "[ao]+";
        }

        if ("-".equals(token)) {
            return "-";
        }

        String accentClass = ACCENT_EQUIVALENTS.get(token);
        if (accentClass != null) {
            return accentClass + "+";
        }

        return escapeRegexChar(token) + "+";
    }

    private static String escapeRegexChar(String value) {
        if (value.length() == 1 && REGEX_META_CHARS.indexOf(value.charAt(0)) >= 0) {
            return "\\" + value;
        }
        return value;
    }

    private static double computePearsonCorrelation(List<FileLinearityMetric> metrics) {
        int count = metrics.size();
        if (count < 2) {
            return 0.0;
        }

        double sumX = 0.0;
        double sumY = 0.0;
        for (FileLinearityMetric metric : metrics) {
            sumX += metric.characters();
            sumY += metric.matchingUs();
        }

        double meanX = sumX / count;
        double meanY = sumY / count;

        double numerator = 0.0;
        double sumSqX = 0.0;
        double sumSqY = 0.0;
        for (FileLinearityMetric metric : metrics) {
            double dx = metric.characters() - meanX;
            double dy = metric.matchingUs() - meanY;
            numerator += dx * dy;
            sumSqX += dx * dx;
            sumSqY += dy * dy;
        }

        double denominator = Math.sqrt(sumSqX * sumSqY);
        return denominator == 0.0 ? 0.0 : numerator / denominator;
    }

    private static double roundTo(double value, int decimals) {
        double factor = Math.pow(10.0, decimals);
        return Math.round(value * factor) / factor;
    }

    private static List<String> loadSwearWords(Path filePath) throws IOException {
        if (!Files.isRegularFile(filePath)) {
            throw new IOException("Swear words file not found: " + filePath.toAbsolutePath());
        }

        String content = Files.readString(filePath, StandardCharsets.UTF_8);
        int openBracket = content.indexOf('[');
        int closeBracket = content.lastIndexOf(']');
        if (openBracket < 0 || closeBracket <= openBracket) {
            throw new IllegalStateException("Invalid swear-words JSON structure in " + filePath);
        }

        String arraySection = content.substring(openBracket + 1, closeBracket);
        Matcher matcher = JSON_STRING_PATTERN.matcher(arraySection);
        List<String> words = new ArrayList<>();

        while (matcher.find()) {
            String unescaped = matcher.group(1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
            words.add(unescaped);
        }

        return words;
    }

    private static List<Path> listLyricFiles(Path inputDir) throws IOException {
        if (!Files.isDirectory(inputDir)) {
            throw new IOException("Input lyrics directory not found: " + inputDir.toAbsolutePath());
        }

        try (Stream<Path> stream = Files.list(inputDir)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(path -> path.getFileName().toString().endsWith(".txt"))
                .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                .toList();
        }
    }

    private static Path resolveBaseDir() {
        Path directInput = Path.of("input/lyrics-data/lyrics");
        if (Files.isDirectory(directInput)) {
            return Path.of("").toAbsolutePath();
        }

        Path nestedInput = Path.of("analysis/java/input/lyrics-data/lyrics");
        if (Files.isDirectory(nestedInput)) {
            return Path.of("analysis/java").toAbsolutePath();
        }

        return Path.of("").toAbsolutePath();
    }

    private static void writeSummary(ExecutionSummary summary, Path summaryPath) throws IOException {
        String json = String.format(
            Locale.US,
            """
            {
              "language": "%s",
              "swearWordsLoaded": %d,
              "filesProcessed": %d,
              "filesWithMatches": %d,
              "totalMatches": %d,
              "totalCharacters": %d,
              "totalBytes": %d,
              "regexCompileMs": %.4f,
              "matchingTimeMs": %.2f,
              "matchingTimeNs": %d,
              "elapsedMs": %.2f,
              "nsPerChar": %.2f,
              "charsPerMs": %.2f,
              "throughputMBs": %.2f,
              "pearsonCorrelationR": %.4f,
              "rSquared": %.4f,
              "outputDir": "%s"
            }
            """,
            escapeJson(summary.language()),
            summary.swearWordsLoaded(),
            summary.filesProcessed(),
            summary.filesWithMatches(),
            summary.totalMatches(),
            summary.totalCharacters(),
            summary.totalBytes(),
            summary.regexCompileMs(),
            summary.matchingTimeMs(),
            summary.matchingTimeNs(),
            summary.elapsedMs(),
            summary.nsPerChar(),
            summary.charsPerMs(),
            summary.throughputMBs(),
            summary.pearsonCorrelationR(),
            summary.rSquared(),
            escapeJson(summary.outputDir())
        );

        Files.writeString(summaryPath, json, StandardCharsets.UTF_8);
    }

    private static void writeLinearityCsv(List<FileLinearityMetric> metrics, Path csvPath) throws IOException {
        StringBuilder builder = new StringBuilder(metrics.size() * 48);
        builder.append("file,characters,bytes,matches,matching_us,ns_per_char\n");

        for (FileLinearityMetric metric : metrics) {
            builder.append(String.format(
                Locale.US,
                "%s,%d,%d,%d,%.2f,%.2f%n",
                metric.fileName(),
                metric.characters(),
                metric.bytes(),
                metric.matches(),
                metric.matchingUs(),
                metric.nsPerChar()
            ));
        }

        Files.writeString(csvPath, builder.toString(), StandardCharsets.UTF_8);
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
