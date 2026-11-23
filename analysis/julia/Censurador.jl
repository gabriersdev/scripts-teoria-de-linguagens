using Unicode
using DataStructures

lyric = "Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
(E aê, TC, Caio Passos? Já falei, tudo puta)
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta

Não nega não, não nega não
Fala que é modelo, mas trombei no casarão
Não nega não, não nega não
Fala que é modelo, mas trombei no casarão
Não nega não, não nega não
Fala que é modelo, mas trombei no casarão
Não nega não, não nega não
Fala que é modelo, mas trombei no casarão
Não quer assumir, acho que tem vergonha
Não quer assumir, acho que tem vergonha
Deve trampar no Caster ou então no Bahamas
Deve trampar no Caster ou então no Bahamas
Conheci na revoada uma mina muito gata
Carinha de princesinha que tu não dava nada
Me falou que estudava, que tudo dos pais ganhava
Tentou me dibrar, mas de uma farsa não passava
Eu não entendi, num apê de luxo ela morava
E o dia inteiro ela não fazia nada
Pra gringa viajava, pelo mundo ela atirava
Essa conta não tá certa, me diz quem que te bancava
Eu já sabia, só não tinha certeza
Ultimamente todas elas tão lucrando com a buceta
Sentaram no pau (De todas formas elas fizeram lucro), nenhuma cobrou um real
Bitch, olha que eu sou o Pedrin, eu que tinha cobrar pr’ocê dar pra mim
As maluca pra dar pra mim, mente pras amiga
Até surta, é, todas elas são

Tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta

Piranha, putinha, vou dizer e geral vai ter que escutar
Não adianta se esconder, o escândalo é sua segunda casa
Ela é putinha, putona, putinha, putona
Era melhor assumir que nós não tem nada contra
Ela é putinha, putona, putinha, putona
Ainda bem que eu ouvi o Ryan e não foi à toa
Valeu, meu sócio, revoada
Yeah, como diz uma das prima, vem pro loirinho que eu empurro a gringa
Cuidado pra não sentar e depois se apaixonar que você vai se ferrar, vai sair iludida
Me jurou que não era, mas puxei a capivara
‘Cê chamava as amiga, as amiga não era nada
Tudo que acontecia elas sempre me contava
Elas mentia pra você pra sentar na minha vara
Fefa liberou o sítio, foi só revoada
Descobri que quase ela segue a van na estrada
Olha que ela nem foi convidada
Quem diria que uma puta ia ficar apegada?
Pra mim todas elas são putas, pra mim todas elas são putas
Pra mim todas elas são puta de segunda a segunda
Pra mim todas elas são putas, pra mim todas elas são putas
Pra mim todas elas são puta de segunda a segunda

Quando você é garota de programa, isso vicia
Porque quanto mais você ganha, mais você quer

Tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo puta
Tudo puta, tudo puta, tudo, tudo, tudo"

banned_words = ["cu", "cuzao", "cuzaos", "cuzinho", "cuzinhos", "cuzoes", "cuzuda", "cuzudas", "cuzudo", "cuzudos","boceta",
"bocetada", "bocetadas", "bocetao", "bocetaos", "bocetas", "bocetazinha", "bocetazinhas", "bocetazona", "bocetazonas",
"bocetinha", "bocetinhas", "bocetoes", "bocetuda", "bocetudas", "bocetudo", "bocetudos", "buceta", "bucetada",
"bucetadas", "bucetao", "bucetaos", "bucetas", "bucetazinha", "bucetazinhas", "bucetazona", "bucetazonas", "bucetinha",
"bucetinhas", "bucetoes", "bucetuda", "bucetudas", "bucetudo", "bucetudos","caralha", "caralhada", "caralhadas",
"caralhao", "caralhaos", "caralhas", "caralhinha", "caralhinhas", "caralhinho", "caralhinhos", "caralho", "caralhoes",
"caralhos", "caralhozao", "caralhozaos", "caralhozinho", "caralhozinhos", "caralhuda", "caralhudas", "caralhudo",
"caralhudos","fodido", "fodidos", "fodida", "fodidas", "fodendo", "foda", "fodais", "fodam", "fodamo", "fodamos","fodas", "fode",
"fodei", "fodeis", "fodem", "fodemo", "fodemos", "fodendo", "foder", "fodera", "foderam", "foderamo", "foderamos", "foderao",
"foderas", "foderdes", "foderei", "fodereis", "foderem", "foderemos", "foderes", "foderia", "foderiam", "foderiamos", "foderias",
"foderieis", "fodermo", "fodermos", "fodes", "fodesse", "fodesseis", "fodessem", "fodessemos", "fodesses", "fodeste", "fodestes",
"fodeu", "fodi", "fodia", "fodiam", "fodiamo", "fodiamos", "fodias", "fodiei", "fodieis", "fodo", "porra", "porrao", "porraos",
"porras", "porrazinha", "porrazinhas", "porrazona", "porrazonas", "porrinha", "porrinhas", "porrona", "porronas", "puta", "putada",
"putadas", "putao", "putaos", "putaria", "putarias", "putas", "putinha", "putinhas", "puto", "putoes", "putos", "putazinha",
"putazinhas", "putazona", "putazonas"]

# Create a regex pattern to match banned words
regex_pattern = "\\b(" * join(banned_words, "|") * ")\\b"
regex = Regex(regex_pattern, "i")  # Case-insensitive matching

function Censor_lyrics(lyric::AbstractString, banned_words::Vector{AbstractString})
    # Normalize the lyric to remove diacritics
    normalized_lyric = Unicode.normalize(lyric, stripmark=true)
    
    # Replace banned words with asterisks
    censored_lyric = replace(normalized_lyric, regex => c -> "*" ^ length(c))
    
    return censored_lyric
end

println(censored_lyric)