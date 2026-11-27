# ==============================================================================
# terminalLyricsCensor.jl - Censurador de Letras Musicais no Terminal (Julia)
#
# Script utilitário em camelCase para mascarar termos chulos e palavrões em letras.
# Padronizado de acordo com:
#   - docs/CODING-GUIDELINES-JULIA.md (Style Guide Oficial do Julia)
#   - docs/BUSINESS-RULES.md (Regra de Negócio 12: Mascaramento Dinâmico)
#   - docs/ARCHITECTURE.md (Entrada em input/lyrics-data/lyrics)
# ==============================================================================

module TerminalLyricsCensor

using Unicode

const MASK_CHAR = '*'
const CENSORED_SECOND_LETTER_PATTERN = "[*#]+"
const WORD_BOUNDARY_START = "(?<![\\p{L}\\p{N}_])"
const WORD_BOUNDARY_END = "(?![\\p{L}\\p{N}_])"
const GENDER_PLACEHOLDER = "[x]"

# Mapeamento canônico de acentuação para construção da regex tolerante
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
    escaperegexchar(value::AbstractString) -> String

Escapa metacaracteres especiais de expressões regulares em caracteres individuais.
"""
function escaperegexchar(value::AbstractString)
    return replace(value, r"[.*+?^${}()|\[\]\\]" => s"\\\0")
end

"""
    tokenizeswearword(rawword::AbstractString) -> Vector{String}

Decompõe um termo do catálogo em tokens lógicos, tratando marcadores de gênero `[X]`
como tokens indivisíveis para permitir flexão posterior.
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
    buildtokenpattern(token::AbstractString) -> String

Gera o padrão regex com quantificador '+' e tolerância de acentuação para um caractere.
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
    buildwordpattern(rawword::AbstractString) -> String

Constrói o padrão regex completo de uma palavra conforme a Regra 12:
- Alongamento de caracteres (+)
- Censura de 2ª letra com '*' ou '#'
- Plural opcional (s*)
"""
function buildwordpattern(rawword::AbstractString)
    tokens = tokenizeswearword(rawword)
    if isempty(tokens)
        return ""
    end

    parts = Vector{String}(undef, length(tokens))
    for (index, token) in enumerate(tokens)
        basepattern = buildtokenpattern(token)
        # Permite censura parcial na 2ª letra (ex: p*ta, c*)
        if index == 2 && token != "-"
            parts[index] = "(?:$(basepattern)|$(CENSORED_SECOND_LETTER_PATTERN))"
        else
            parts[index] = basepattern
        end
    end

    pluralsuffix = tokens[end] == "s" ? "" : "s*"
    return join(parts) * pluralsuffix
end

"""
    load_swear_words_from_json(json_path::AbstractString) -> Vector{String}

Carrega dinamicamente a lista canônica de palavrões a partir de 'lib/swear-words.json'.
Caso ocorra erro na leitura, recorre a uma lista de salvaguarda.
"""
function load_swear_words_from_json(json_path::AbstractString)
    if !isfile(json_path)
        @warn "Arquivo de termos não encontrado em: $json_path. Usando lista fallback."
        return String["cu", "buceta", "caralho", "foda", "foder", "puta", "porra"]
    end

    content = read(json_path, String)
    # Extrai os termos do JSON sem dependência de pacotes externos
    terms = String[]
    for m in eachmatch(r"\"([^\"]+)\"", content)
        term = strip(m.captures[1])
        if term != "swear-words" && !isempty(term)
            push!(terms, term)
        end
    end

    return terms
end

"""
    build_censor_regex(swear_words::AbstractVector{<:AbstractString}) -> Regex

Compila a expressão regular completa com limites Unicode e flag case-insensitive.
"""
function build_censor_regex(swear_words::AbstractVector{<:AbstractString})
    patterns = String[]
    for word in swear_words
        pattern = buildwordpattern(word)
        if !isempty(pattern)
            push!(patterns, pattern)
        end
    end

    combined = join(patterns, "|")
    full_pattern = WORD_BOUNDARY_START * "(?:" * combined * ")" * WORD_BOUNDARY_END
    return Regex(full_pattern, "i")
end

"""
    mask_matched_word(matched::AbstractString) -> String

Aplica a Regra de Mascaramento oficial (Regra 12):
Mantém o primeiro caractere original e substitui todos os demais por '*'.
Exemplos: 'puta' -> 'p***', 'PUTAS' -> 'P****', 'cú' -> 'c*'
"""
function mask_matched_word(matched::AbstractString)
    chars = collect(matched)
    if length(chars) <= 1
        return string(chars[1]) * string(MASK_CHAR)
    end
    return string(chars[1]) * repeat(string(MASK_CHAR), length(chars) - 1)
end

"""
    censor_lyric(lyric::AbstractString, censor_regex::Regex) -> Tuple{String, Int}

Censura o texto da letra preservando integralmente os acentos e a formatação do restante da música.
Retorna a letra censurada e o total de termos mascarados.
"""
function censor_lyric(lyric::AbstractString, censor_regex::Regex)
    matches_count = 0
    censored_text = replace(lyric, censor_regex => function(matched)
        matches_count += 1
        return mask_matched_word(matched)
    end)
    return (censored_text, matches_count)
end

"""
    main(args::Vector{String}=ARGS)

Ponto de entrada principal para execução interativa ou via linha de comando.
Uso via CLI: `julia terminalLyricsCensor.jl [ID_DA_MUSICA]`
"""
function main(args::Vector{String}=ARGS)
    script_dir = @__DIR__
    project_root = normpath(joinpath(script_dir, "..", ".."))
    json_path = normpath(joinpath(project_root, "lib", "swear-words.json"))
    lyrics_dir = normpath(joinpath(script_dir, "input", "lyrics-data", "lyrics"))

    # 1. Obtenção do ID da música (via argumento ou prompt interativo)
    music_id = ""
    if !isempty(args)
        music_id = strip(args[1])
    else
        print("Digite o ID da música que deseja censurar (ex: 98001): ")
        flush(stdout)
        music_id = strip(readline())
    end

    if isempty(music_id)
        println("ID inválido ou não informado. Encerrando.")
        return 1
    end

    # Garante a extensão .txt
    file_name = endswith(music_id, ".txt") ? music_id : music_id * ".txt"
    file_path = joinpath(lyrics_dir, file_name)

    if !isfile(file_path)
        println("Erro: Arquivo não encontrado em: ", file_path)
        return 1
    end

    # 2. Carrega catálogo dinâmico de termos e compila regex
    println("Carregando catálogo de termos e compilando expressão regular...")
    swear_words = load_swear_words_from_json(json_path)
    censor_regex = build_censor_regex(swear_words)

    # 3. Lê o arquivo e executa a censura padronizada
    original_lyric = read(file_path, String)
    censored_lyric, total_matches = censor_lyric(original_lyric, censor_regex)

    # 4. Exibe o resultado e resumo
    println("\n" * "="^60)
    println("Letra Mascarada (ID: $music_id) | Termos encontrados: $total_matches")
    println("="^60 * "\n")
    println(censored_lyric)
    println("\n" * "="^60)
    println("Concluído com sucesso! (Total de termos mascarados: $total_matches)")

    return 0
end

end # module TerminalLyricsCensor

# Executa se for chamado diretamente pelo interpretador Julia
if abspath(PROGRAM_FILE) == @__FILE__
    TerminalLyricsCensor.main()
end
