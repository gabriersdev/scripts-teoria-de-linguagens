"""
Swear word detection and masking script for Julia.
Dynamically builds Unicode-aware, case-insensitive regular expressions from
`lib/swear-words.json`, processes lyrics in `input/lyrics-data/lyrics`, and
writes masked outputs to `output/lyrics`.
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
Aggregated execution metrics for the masking run.
"""
struct ExecutionSummary
    language::String
    swear_words_loaded::Int
    files_processed::Int
    files_with_matches::Int
    total_matches::Int
    elapsed_ms::Float64
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
      "elapsedMs": $(round(summary.elapsed_ms; digits = 2)),
      "outputDir": "$(escapejson(summary.output_dir))"
    }
    """
    write(filepath, jsoncontent)
end

"""
Main entry point for reading lyrics, masking swear words, and persisting outputs.
"""
function runmasking()
    starttime = time_ns()

    scriptdir = @__DIR__
    swearwordspath = normpath(joinpath(scriptdir, "..", "..", "lib", "swear-words.json"))
    inputdir = normpath(joinpath(scriptdir, "input", "lyrics-data", "lyrics"))
    outputdir = normpath(joinpath(scriptdir, "output", "lyrics"))
    summarypath = normpath(joinpath(scriptdir, "output", "summary.json"))

    swearwords = loadswearwords(swearwordspath)
    swearregex = buildswearregex(swearwords)

    mkpath(outputdir)

    lyricfiles = sort([
        entry for entry in readdir(inputdir)
        if endswith(entry, ".txt") && isfile(joinpath(inputdir, entry))
    ])

    fileswithmatches = 0
    totalmatches = 0

    for filename in lyricfiles
        inputpath = joinpath(inputdir, filename)
        outputpath = joinpath(outputdir, filename)

        content = read(inputpath, String)
        result = masktext(content, swearregex)

        if result.match_count > 0
            fileswithmatches += 1
            totalmatches += result.match_count
        end

        write(outputpath, result.masked_text)
    end

    elapsedms = (time_ns() - starttime) / 1_000_000.0
    summary = ExecutionSummary(
        "Julia",
        length(swearwords),
        length(lyricfiles),
        fileswithmatches,
        totalmatches,
        elapsedms,
        outputdir,
    )

    writesummary(summary, summarypath)

    println("[Julia] Swear word masking completed.")
    println("  Swear words loaded : ", summary.swear_words_loaded)
    println("  Files processed    : ", summary.files_processed)
    println("  Files with matches : ", summary.files_with_matches)
    println("  Total matches      : ", summary.total_matches)
    println("  Elapsed time (ms)  : ", round(summary.elapsed_ms; digits = 2))
    println("  Output directory   : ", summary.output_dir)
end

end

SwearWordMasker.runmasking()
