# ==============================================================================
# censorLyricsLegacy.jl - Versão Legada do Script (Resgatada do histórico Git)
# Commit base: 5613040 / 3c7749e (Implementação anterior de S3rvulo)
#
# Observação: Esta versão foi preservada para consulta e testes pontuais.
# Para a versão atualizada e padronizada em camelCase conforme as diretrizes do projeto,
# utilize 'censorLyrics.jl' ou o script oficial 'maskSwearWords.jl'.
# ==============================================================================

using Unicode

print("Digite o ID da música que deseja censurar: ")
flush(stdout)
music_id = strip(readline())

lyrics_directory = joinpath(@__DIR__, "input", "lyrics-data", "lyrics")
file_name = endswith(music_id, ".txt") ? music_id : music_id * ".txt"
file_path = joinpath(lyrics_directory, file_name)

if !isfile(file_path)
    println("Erro: o arquivo não foi encontrado em: ", file_path)
    exit(1)
end

lyric = read(file_path, String)

banned_words = [
    "cu", "cuzao", "cuzaos", "cuzinho", "cuzinhos", "cuzoes", "cuzuda", "cuzudas", "cuzudo", "cuzudos", "boceta",
    "bocetada", "bocetadas", "bocetao", "bocetaos", "bocetas", "bocetazinha", "bocetazinhas", "bocetazona", "bocetazonas",
    "bocetinha", "bocetinhas", "bocetoes", "bocetuda", "bocetudas", "bocetudo", "bocetudos", "buceta", "bucetada",
    "bucetadas", "bucetao", "bucetaos", "bucetas", "bucetazinha", "bucetazinhas", "bucetazona", "bucetazonas", "bucetinha",
    "bucetinhas", "bucetoes", "bucetuda", "bucetudas", "bucetudo", "bucetudos", "caralha", "caralhada", "caralhadas",
    "caralhao", "caralhaos", "caralhas", "caralhinha", "caralhinhas", "caralhinho", "caralhinhos", "caralho", "caralhoes",
    "caralhos", "caralhozao", "caralhozaos", "caralhozinho", "caralhozinhos", "caralhuda", "caralhudas", "caralhudo",
    "caralhudos", "fodido", "fodidos", "fodida", "fodidas", "foda", "fodais", "fodam", "fodamo", "fodamos", "fodas", "fode",
    "fodei", "fodeis", "fodem", "fodemo", "fodemos", "fodendo", "foder", "fodera", "foderam", "foderamo", "foderamos", "foderao",
    "foderas", "foderdes", "foderei", "fodereis", "foderem", "foderemos", "foderes", "foderia", "foderiam", "foderiamos", "foderias",
    "foderieis", "fodermo", "fodermos", "fodes", "fodesse", "fodesseis", "fodessem", "fodessemos", "fodesses", "fodeste", "fodestes",
    "fodeu", "fodi", "fodia", "fodiam", "fodiamo", "fodiamos", "fodias", "fodiei", "fodieis", "fodo", "porra", "porrao", "porraos",
    "porras", "porrazinha", "porrazinhas", "porrazona", "porrazonas", "porrinha", "porrinhas", "porrona", "porronas", "puta", "putada",
    "putadas", "putao", "putaos", "putaria", "putarias", "putas", "putinha", "putinhas", "puto", "putoes", "putos", "putazinha",
    "putazinhas", "putazona", "putazonas"
]

function Censor_lyrics(lyric::AbstractString, banned_words::AbstractVector{<:AbstractString})
    # Cria a expressão regular unindo as palavras banidas
    regex_pattern = "\\b(" * join(banned_words, "|") * ")\\b"
    regex = Regex(regex_pattern, "i")

    # Normalização que remove diacríticos (acentos)
    normalized_lyric = Unicode.normalize(lyric, stripmark=true)

    # Substitui a palavra inteira por asteriscos
    return replace(normalized_lyric, regex => c -> "*" ^ length(c))
end

censored_lyric = Censor_lyrics(lyric, banned_words)

println(censored_lyric)
