using Unicode

print("Digite a pasta das músicas que deseja censurar: ")
flush(stdout)
input_folder_name = strip(readline())

print("Digite a pasta das músicas que deseja colocar as músicas censuradas(ou enter para nome padrão): ")
flush(stdout)
output_folder_name = strip(readline())
if isempty(output_folder_name)
    output_folder_name = input_folder_name * "_censored"
end

input_base_directory = joinpath(@__DIR__, "input")
output_base_directory = joinpath(@__DIR__, "output_Censurador")

input_lyrics_folder = joinpath(input_base_directory, input_folder_name)
output_lyrics_folder = joinpath(output_base_directory, output_folder_name)

if !isdir(input_lyrics_folder)
    error("Erro: A pasta não foi encontrado em: ", input_lyrics_folder)
end

mkpath(output_lyrics_folder)

banned_words = ["cu", "cuzao", "cuzaos", "cuzinho", "cuzinhos", "cuzoes", "cuzuda", "cuzudas", "cuzudo", "cuzudos","boceta",
"bocetada", "bocetadas", "bocetao", "bocetaos", "bocetas", "bocetazinha", "bocetazinhas", "bocetazona", "bocetazonas",
"bocetinha", "bocetinhas", "bocetoes", "bocetuda", "bocetudas", "bocetudo", "bocetudos", "buceta", "bucetada",
"bucetadas", "bucetao", "bucetaos", "bucetas", "bucetazinha", "bucetazinhas", "bucetazona", "bucetazonas", "bucetinha",
"bucetinhas", "bucetoes", "bucetuda", "bucetudas", "bucetudo", "bucetudos","caralha", "caralhada", "caralhadas",
"caralhao", "caralhaos", "caralhas", "caralhinha", "caralhinhas", "caralhinho", "caralhinhos", "caralho", "caralhoes",
"caralhos", "caralhozao", "caralhozaos", "caralhozinho", "caralhozinhos", "caralhuda", "caralhudas", "caralhudo",
"caralhudos","fodido", "fodidos", "fodida", "fodidas", "foda", "fodais", "fodam", "fodamo", "fodamos","fodas", "fode",
"fodei", "fodeis", "fodem", "fodemo", "fodemos", "fodendo", "foder", "fodera", "foderam", "foderamo", "foderamos", "foderao",
"foderas", "foderdes", "foderei", "fodereis", "foderem", "foderemos", "foderes", "foderia", "foderiam", "foderiamos", "foderias",
"foderieis", "fodermo", "fodermos", "fodes", "fodesse", "fodesseis", "fodessem", "fodessemos", "fodesses", "fodeste", "fodestes",
"fodeu", "fodi", "fodia", "fodiam", "fodiamo", "fodiamos", "fodias", "fodiei", "fodieis", "fodo", "porra", "porrao", "porraos",
"porras", "porrazinha", "porrazinhas", "porrazona", "porrazonas", "porrinha", "porrinhas", "porrona", "porronas", "puta", "putada",
"putadas", "putao", "putaos", "putaria", "putarias", "putas", "putinha", "putinhas", "puto", "putoes", "putos", "putazinha",
"putazinhas", "putazona", "putazonas"]

function build_ban_regex(banned_words::AbstractVector{<:AbstractString})
    ban_regex_pattern = "\\b(" * join(banned_words, "|") * ")\\b"
    return Regex(ban_regex_pattern, "i")
end

function censor_lyrics(lyric::AbstractString, ban_regex::Regex)
    # Normalize the lyric to remove diacritics
    normalized_lyric = Unicode.normalize(lyric, stripmark=true)
    
    # Replace banned words with asterisks
    return replace(normalized_lyric, ban_regex => c -> "*" ^ length(c))
end

ban_regex = build_ban_regex(banned_words)

input_lyrics_files = filter(entry -> isfile(joinpath(input_lyrics_folder, entry)), readdir(input_lyrics_folder))
println("Encontrados ", length(input_lyrics_files), " arquivos em '", input_lyrics_folder, "'.")

for file_name in input_lyrics_files
    input_path = joinpath(input_lyrics_folder, file_name)
    output_path = joinpath(output_lyrics_folder, file_name)

    lyric = read(input_path, String)
    censored_lyrics = censor_lyrics(lyric, ban_regex)
    write(output_path, censored_lyrics)
end

println("Concluído! Arquivos salvos em: ", output_lyrics_folder)