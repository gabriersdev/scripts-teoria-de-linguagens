"""
Swear word detection and masking script for Julia.
Dynamically builds Unicode-aware, case-insensitive regular expressions from
`lib/swear-words.json`, processes lyrics in `input/lyrics-data/lyrics`, and
writes masked outputs to `output/lyrics`, plus summary and linearity metrics.
"""
module SwearWordMasker

const MASK_CHAR = '*'
const CENSORED_SECOND_LETTER_PATTERN = "[*#]+"
const WORD_BOUNDARY_START = "(?<![\\p{L}\\p{N}_])"
const WORD_BOUNDARY_END = "(?![\\p{L}\\p{N}_])"
const GENDER_PLACEHOLDER = "[x]"

const ACCENT_EQUIVALENTS = Dict{String, String}(
    "á" => "[aá]",
    "à" => "[aà]",
    "â" => "[aâ]",
    "ã" => "[aã]",
    "ä" => "[aä]",
    "é" => "[eé]",
    "è" => "[eè]",
    "ê" => "[eê]",
    "ë" => "[eë]",
    "í" => "[ií]",
    "ì" => "[iì]",
    "î" => "[iî]",
    "ï" => "[iï]",
    "ó" => "[oó]",
    "ò" => "[oò]",
    "ô" => "[oô]",
    "õ" => "[oõ]",
    "ö" => "[oö]",
    "ú" => "[uú]",
    "ù" => "[uù]",
    "û" => "[uû]",
    "ü" => "[uü]",
    "ç" => "[cç]",
)

"""
Prefix trie node used to left-factor swear word regex patterns.
"""
mutable struct PatternTrieNode
    children::Dict{String, PatternTrieNode}
    isterminal::Bool
    terminalsuffix::String
end

PatternTrieNode() = PatternTrieNode(Dict{String, PatternTrieNode}(), false, "")

"""
Result of masking a single lyric text.
"""
struct MaskResult
    masked_text::String
    match_count::Int
end

"""
Per-file timing and size metrics used to evaluate O(n) linearity.
"""
struct FileLinearityMetric
    file_name::String
    characters::Int
    bytes::Int
    matches::Int
    matching_us::Float64
    ns_per_char::Float64
end

"""
Aggregated execution metrics for the masking run.
"""
struct ExecutionSummary
    language::String
    swear_words_loaded::Int
    files_processed::Int
    files_with_matches::Int
    total_matches::Int
    total_characters::Int
    total_bytes::Int
    regex_compile_ms::Float64
    matching_time_ms::Float64
    matching_time_ns::Int64
    elapsed_ms::Float64
    ns_per_char::Float64
    chars_per_ms::Float64
    throughput_mbs::Float64
    pearson_r::Float64
    r_squared::Float64
    output_dir::String
end

"""
Escapes regex metacharacters in a single character token.
"""
function escaperegexchar(value::AbstractString)
    return replace(value, r"[.*+?^${}()|\[\]\\]" => s"\\\0")
end

"""
Splits a raw swear word into logical tokens, treating `[X]` as a single token.
"""
function tokenizeswearword(rawword::AbstractString)
    normalized = lowercase(strip(rawword))
    if isempty(normalized)
        return String[]
    end

    chars = collect(normalized)
    tokens = String[]
    index = 1
    total = length(chars)

    while index <= total
        if index + 2 <= total &&
           chars[index] == '[' &&
           chars[index + 1] == 'x' &&
           chars[index + 2] == ']'
            push!(tokens, GENDER_PLACEHOLDER)
            index += 3
            continue
        end

        push!(tokens, string(chars[index]))
        index += 1
    end

    return tokens
end

"""
Builds the regex fragment for an individual token.
"""
function buildtokenpattern(token::AbstractString)
    if token == GENDER_PLACEHOLDER
        return "[ao]+"
    end

    if token == "-"
        return "-"
    end

    if haskey(ACCENT_EQUIVALENTS, token)
        return ACCENT_EQUIVALENTS[token] * "+"
    end

    return escaperegexchar(token) * "+"
end

"""
Builds the ordered token regex fragments and plural suffix for a single swear word.
"""
function buildwordtokenpatterns(rawword::AbstractString)
    tokens = tokenizeswearword(rawword)
    if isempty(tokens)
        return (String[], "")
    end

    parts = Vector{String}(undef, length(tokens))
    for (index, token) in enumerate(tokens)
        basepattern = buildtokenpattern(token)
        if index == 2 && token != "-"
            parts[index] = "(?:$(basepattern)|$(CENSORED_SECOND_LETTER_PATTERN))"
        else
            parts[index] = basepattern
        end
    end

    pluralsuffix = tokens[end] == "s" ? "" : "s*"
    return (parts, pluralsuffix)
end

"""
Inserts a tokenized swear word pattern into the prefix trie.
"""
function inserttrie!(root::PatternTrieNode, tokenpatterns::AbstractVector{<:AbstractString}, pluralsuffix::AbstractString)
    current = root
    for pattern in tokenpatterns
        if !haskey(current.children, pattern)
            current.children[pattern] = PatternTrieNode()
        end
        current = current.children[pattern]
    end

    current.isterminal = true
    if isempty(current.terminalsuffix)
        current.terminalsuffix = String(pluralsuffix)
    end
end

"""
Serializes a prefix trie node into a left-factored regex string.
"""
function serializetrie(node::PatternTrieNode)
    keys_sorted = sort!(collect(keys(node.children)))
    branches = String[]
    sizehint!(branches, length(keys_sorted) + 1)

    for key in keys_sorted
        childsuffix = serializetrie(node.children[key])
        push!(branches, key * childsuffix)
    end

    if node.isterminal
        if isempty(branches)
            return node.terminalsuffix
        end

        if isempty(node.terminalsuffix)
            return length(branches) == 1 ? "(?:$(branches[1]))?" : "(?:$(join(branches, "|")))?"
        end

        push!(branches, node.terminalsuffix)
    end

    if length(branches) == 1
        return branches[1]
    end

    return "(?:$(join(branches, "|")))"
end

"""
Builds the dynamic regex pattern for a single swear word.
"""
function buildwordpattern(rawword::AbstractString)
    parts, pluralsuffix = buildwordtokenpatterns(rawword)
    if isempty(parts)
        return nothing
    end

    return join(parts) * pluralsuffix
end

"""
Compiles a single case-insensitive Unicode regex combining all swear words
into a left-factored prefix trie.
"""
function buildswearregex(words::AbstractVector{<:AbstractString})
    root = PatternTrieNode()
    insertedcount = 0

    for word in words
        trimmed = strip(word)
        if isempty(trimmed)
            continue
        end

        parts, pluralsuffix = buildwordtokenpatterns(trimmed)
        if isempty(parts)
            continue
        end

        inserttrie!(root, parts, pluralsuffix)
        insertedcount += 1
    end

    if insertedcount == 0
        error("No valid swear word patterns were generated.")
    end

    triepattern = serializetrie(root)
    combined = "$(WORD_BOUNDARY_START)(?:$(triepattern))$(WORD_BOUNDARY_END)"
    return Regex(combined, "i")
end

"""
Masks a matched swear word keeping its first character and replacing the rest with `*`.
"""
function maskterm(term::AbstractString)
    charcount = length(term)
    if charcount <= 1
        return String(term)
    end

    return string(first(term)) * repeat(string(MASK_CHAR), charcount - 1)
end

"""
Finds and masks all swear word occurrences in `text`.
"""
function masktext(text::AbstractString, pattern::Regex)
    matchcount = 0
    masked = replace(text, pattern => matched -> begin
        matchcount += 1
        return maskterm(matched)
    end)

    return MaskResult(masked, matchcount)
end

"""
Computes Pearson correlation coefficient r between character count and matching time (us).
"""
function computepearson(metrics::AbstractVector{FileLinearityMetric})
    count = length(metrics)
    if count < 2
        return 0.0
    end

    sumx = 0.0
    sumy = 0.0
    for metric in metrics
        sumx += metric.characters
        sumy += metric.matching_us
    end

    meanx = sumx / count
    meany = sumy / count

    numerator = 0.0
    sumsqx = 0.0
    sumsqy = 0.0
    for metric in metrics
        dx = metric.characters - meanx
        dy = metric.matching_us - meany
        numerator += dx * dy
        sumsqx += dx * dx
        sumsqy += dy * dy
    end

    denominator = sqrt(sumsqx * sumsqy)
    return denominator == 0.0 ? 0.0 : numerator / denominator
end

"""
Loads the list of swear words from `lib/swear-words.json` without external dependencies.
"""
function loadswearwords(filepath::AbstractString)
    if !isfile(filepath)
        error("Swear words file not found: $(filepath)")
    end

    content = read(filepath, String)
    openbracket = findfirst('[', content)
    closebracket = findlast(']', content)
    if openbracket === nothing || closebracket === nothing || closebracket <= openbracket
        error("Invalid swear-words JSON structure in $(filepath)")
    end

    source = SubString(content, nextind(content, openbracket), prevind(content, closebracket))

    words = String[]
    for item in eachmatch(r"\"((?:[^\"\\]|\\.)*)\"", source)
        raw = item.captures[1]
        unescaped = replace(raw, "\\\"" => "\"", "\\\\" => "\\")
        push!(words, unescaped)
    end

    return words
end

"""
Escapes a string for JSON output.
"""
function escapejson(value::AbstractString)
    return replace(value, "\\" => "\\\\", "\"" => "\\\"")
end

"""
Writes the execution summary to a JSON file.
"""
function writesummary(summary::ExecutionSummary, filepath::AbstractString)
    jsoncontent = """
    {
      "language": "$(escapejson(summary.language))",
      "swearWordsLoaded": $(summary.swear_words_loaded),
      "filesProcessed": $(summary.files_processed),
      "filesWithMatches": $(summary.files_with_matches),
      "totalMatches": $(summary.total_matches),
      "totalCharacters": $(summary.total_characters),
      "totalBytes": $(summary.total_bytes),
      "regexCompileMs": $(round(summary.regex_compile_ms; digits = 4)),
      "matchingTimeMs": $(round(summary.matching_time_ms; digits = 2)),
      "matchingTimeNs": $(summary.matching_time_ns),
      "elapsedMs": $(round(summary.elapsed_ms; digits = 2)),
      "nsPerChar": $(round(summary.ns_per_char; digits = 2)),
      "charsPerMs": $(round(summary.chars_per_ms; digits = 2)),
      "throughputMBs": $(round(summary.throughput_mbs; digits = 2)),
      "pearsonCorrelationR": $(round(summary.pearson_r; digits = 4)),
      "rSquared": $(round(summary.r_squared; digits = 4)),
      "outputDir": "$(escapejson(summary.output_dir))"
    }
    """
    write(filepath, jsoncontent)
end

"""
Writes per-file linearity metrics to a CSV file for scatter plot analysis.
"""
function writelinearitycsv(metrics::AbstractVector{FileLinearityMetric}, filepath::AbstractString)
    open(filepath, "w") do io
        println(io, "file,characters,bytes,matches,matching_us,ns_per_char")
        for metric in metrics
            println(
                io,
                metric.file_name, ",",
                metric.characters, ",",
                metric.bytes, ",",
                metric.matches, ",",
                round(metric.matching_us; digits = 2), ",",
                round(metric.ns_per_char; digits = 2),
            )
        end
    end
end

"""
Maps each matched text occurrence back to its canonical term in `lib/swear-words.json`
and exports `output/matches-catalog.csv` for downstream linguistic analysis.
"""
function exportmatchcatalog(
    swearwords::AbstractVector{<:AbstractString},
    swearregex::Regex,
    inputdir::AbstractString,
    lyricfiles::AbstractVector{<:AbstractString},
    catalogpath::AbstractString,
)
    sortedwords = sort(
        [String(strip(word)) for word in swearwords if !isempty(strip(word))];
        by = word -> (-length(tokenizeswearword(word)), word),
    )

    compiledterms = Tuple{String, Regex}[]
    for word in sortedwords
        pattern = buildwordpattern(word)
        if pattern !== nothing
            push!(compiledterms, (word, Regex("^$(pattern)\$", "i")))
        end
    end

    open(catalogpath, "w") do io
        println(io, "track_id,matched_text,canonical_term")
        for filename in lyricfiles
            trackid = replace(filename, ".txt" => "")
            content = read(joinpath(inputdir, filename), String)

            for m in eachmatch(swearregex, content)
                matchedtext = m.match
                canonical = "unknown"
                for (term, termregex) in compiledterms
                    if occursin(termregex, matchedtext)
                        canonical = term
                        break
                    end
                end

                safematched = replace(matchedtext, "\"" => "\"\"")
                safecanonical = replace(canonical, "\"" => "\"\"")
                println(io, "\"", trackid, "\",\"", safematched, "\",\"", safecanonical, "\"")
            end
        end
    end
end

"""
Main entry point for reading lyrics, masking swear words, and persisting outputs.
"""
function runmasking(exportcatalog::Bool = false)
    totalstartns = time_ns()

    scriptdir = @__DIR__
    swearwordspath = normpath(joinpath(scriptdir, "..", "..", "lib", "swear-words.json"))
    inputdir = normpath(joinpath(scriptdir, "input", "lyrics-data", "lyrics"))
    outputdir = normpath(joinpath(scriptdir, "output", "lyrics"))
    summarypath = normpath(joinpath(scriptdir, "output", "summary.json"))
    linearitycsvpath = normpath(joinpath(scriptdir, "output", "linearity-metrics.csv"))

    swearwords = loadswearwords(swearwordspath)

    compilestartns = time_ns()
    swearregex = buildswearregex(swearwords)
    compileelapsedns = time_ns() - compilestartns

    warmupsample = "puta caralho xerecão c* arrombada foda-se texto limpo de teste"
    for _ in 1:50
        masktext(warmupsample, swearregex)
    end

    mkpath(outputdir)

    lyricfiles = sort([
        entry for entry in readdir(inputdir)
        if endswith(entry, ".txt") && isfile(joinpath(inputdir, entry))
    ])

    fileswithmatches = 0
    totalmatches = 0
    totalcharacters = 0
    totalbytes = 0
    totalmatchingns = Int64(0)
    linearitymetrics = FileLinearityMetric[]
    sizehint!(linearitymetrics, length(lyricfiles))

    for filename in lyricfiles
        inputpath = joinpath(inputdir, filename)
        outputpath = joinpath(outputdir, filename)

        content = read(inputpath, String)
        charcount = length(content)
        bytecount = ncodeunits(content)

        matchstartns = time_ns()
        result = masktext(content, swearregex)
        filematchns = Int64(time_ns() - matchstartns)

        totalcharacters += charcount
        totalbytes += bytecount
        totalmatchingns += filematchns

        push!(linearitymetrics, FileLinearityMetric(
            filename,
            charcount,
            bytecount,
            result.match_count,
            filematchns / 1_000.0,
            charcount > 0 ? filematchns / charcount : 0.0,
        ))

        if result.match_count > 0
            fileswithmatches += 1
            totalmatches += result.match_count
        end

        write(outputpath, result.masked_text)
    end

    totalelapsedms = (time_ns() - totalstartns) / 1_000_000.0
    matchingtimems = totalmatchingns / 1_000_000.0
    nsperchar = totalcharacters > 0 ? totalmatchingns / totalcharacters : 0.0
    charsperms = matchingtimems > 0.0 ? totalcharacters / matchingtimems : 0.0
    throughputmbs = totalmatchingns > 0 ? (totalbytes / totalmatchingns) * 1_000.0 : 0.0
    pearsonr = computepearson(linearitymetrics)

    summary = ExecutionSummary(
        "Julia",
        length(swearwords),
        length(lyricfiles),
        fileswithmatches,
        totalmatches,
        totalcharacters,
        totalbytes,
        compileelapsedns / 1_000_000.0,
        matchingtimems,
        totalmatchingns,
        totalelapsedms,
        nsperchar,
        charsperms,
        throughputmbs,
        pearsonr,
        pearsonr * pearsonr,
        outputdir,
    )

    writesummary(summary, summarypath)
    writelinearitycsv(linearitymetrics, linearitycsvpath)

    println("[Julia] Swear word masking completed.")
    println("  Swear words loaded  : ", summary.swear_words_loaded)
    println("  Files processed     : ", summary.files_processed)
    println("  Files with matches  : ", summary.files_with_matches)
    println("  Total matches       : ", summary.total_matches)
    println("  Total characters    : ", summary.total_characters)
    println("  Regex compile (ms)  : ", round(summary.regex_compile_ms; digits = 4))
    println("  Pure matching (ms)  : ", round(summary.matching_time_ms; digits = 2))
    println("  Elapsed time (ms)   : ", round(summary.elapsed_ms; digits = 2))
    println("  Time/char (ns/char) : ", round(summary.ns_per_char; digits = 2))
    println("  Throughput (ch/ms)  : ", round(summary.chars_per_ms; digits = 2))
    println("  Throughput (MB/s)   : ", round(summary.throughput_mbs; digits = 2))
    println("  Linearity r / R^2   : ", round(summary.pearson_r; digits = 4), " / ", round(summary.r_squared; digits = 4))
    println("  Output directory    : ", summary.output_dir)

    if exportcatalog
        catalogpath = normpath(joinpath(scriptdir, "output", "matches-catalog.csv"))
        exportmatchcatalog(swearwords, swearregex, inputdir, lyricfiles, catalogpath)
        println("  Match catalog CSV   : ", catalogpath)
    end
end

end

SwearWordMasker.runmasking("--export-analysis" in ARGS)
