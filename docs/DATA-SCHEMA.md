# Esquema de Dados e Atributos

Este documento descreve os contratos de dados dos arquivos JSON armazenados em `/lyrics-list` e os arquivos de saída gerados em `/lyrics-data`.

---

## 1. Estrutura dos Arquivos de Lista (`/lyrics-list/*.json`)

Cada arquivo dentro de `/lyrics-list/` (ex.: `funk-list.json`, `rap-list.json`, `rock-list.json`) é representado por uma lista (array) contendo objetos de agrupamento temático/gênero musical.

```json
[
  {
    "id": "Lista de Músicas do gênero Rock",
    "complete": false,
    "source": [
      "https://open.spotify.com/playlist/5Me9UnTwWnPA2FuTgUKzIy",
      "https://open.spotify.com/intl-pt/album/0HU62E1P8fLUxiFLn1gajG"
    ],
    "lyrics": [
      {
        "id": 98401,
        "name": "A Minha Menina",
        "artists": "Os Mutantes",
        "complete": false
      }
    ]
  }
]
```

### Atributos da Lista (Nível Raiz)

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | Título ou identificador textual legível da lista (ex.: `"Lista de Músicas do gênero Rock"`). |
| `complete` | `boolean` | Flag de status geral da lista. Indica se a curadoria de títulos e artistas de todas as músicas já foi finalizada. Quando marcada como `true`, scripts de enriquecimento automático de nomes (como `populate-artists.ts`) ignoram o arquivo para não reprocessar itens consolidados. |
| `source` | `string[]` | Conjunto de URLs de referência (links de playlists, álbuns ou perfis de artistas do Spotify) utilizados para minerar ou validar as músicas do gênero. |
| `lyrics` | `object[]` | Coleção contendo os itens individuais de faixas musicais pertencentes àquela lista. |

---

### Atributos dos Itens de Música (`lyrics[i]`)

Cada objeto contido dentro da propriedade `lyrics` representa uma faixa musical a ser minerada e analisada:

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `number` \| `string` | Identificador numérico sequencial único da faixa (ex.: `98401`). Gerado pelo utilitário `util/update-lyrics-list-ids.ts`. Serve como chave primária estática para vincular metadados (`/lyrics-data/{id}.json`) e letras brutas (`/lyrics-data/lyrics/{id}.txt`). |
| `name` | `string` | Nome ou título da música cadastrada. Durante o pipeline, passa por higienização para remover sufixos de ruído (ex.: "(Ao Vivo)", "(Remaster)"). |
| `artists` | `string` | Nome do artista principal ou colaboradores separados por vírgula (ex.: `"Cacife Clandestino, WC no Beat, Felp 22"`). Nomes com vírgula própria (ex.: `"Ryu, the Runner"`) são protegidos por máscara de token para não sofrerem quebra indevida. |
| `complete` | `boolean` \| `number` | Flag de estado e ciclo de vida da extração no `pipeline-extractor.ts`:<br>• `true`: Sucesso total. Metadados e letra extraídos e gravados com integridade.<br>• `1`: Sucesso parcial. Metadados extraídos e salvos em JSON, mas a letra não foi encontrada ou falhou na validação de sanidade.<br>• `false` (ou omitido): Faixa pendente ou falha crítica em metadados mínimos (sem ISRC ou duração). |

---

## 2. Estrutura dos Arquivos de Metadados (`/lyrics-data/{id}.json`)

Gerados automaticamente pelo `pipeline-extractor.ts` quando os metadados são resolvidos:

```json
[
  {
    "id": 98401,
    "metadata": {
      "title": "A Minha Menina",
      "artists": [
        "Os Mutantes"
      ],
      "album": "Millennium: Tropicália",
      "releaseDate": "1999",
      "durationMs": 281000,
      "genres": [
        "rock",
        "mpb",
        "brazilian",
        "psychedelic rock"
      ],
      "isrc": "BRPGD6800016",
      "coverUrl": "https://is1-ssl.mzstatic.com/image/thumb/...",
      "sources": {
        "musicbrainz": "https://musicbrainz.org/recording/...",
        "itunes": "https://music.apple.com/...",
        "deezer": "https://www.deezer.com/track/..."
      }
    },
    "lyricPath": "/lyrics/98401.txt"
  }
]
```

### Atributos do Objeto de Metadados

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `number` \| `string` | ID correspondente da faixa na lista de origem. |
| `metadata.title` | `string` | Título consolidado da música. |
| `metadata.artists` | `string[]` | Array com os nomes dos artistas/intérpretes identificados. |
| `metadata.album` | `string` \| `null` | Álbum oficial ou coletânea onde a faixa foi publicada. |
| `metadata.releaseDate`| `string` \| `null` | Data ou ano de lançamento oficial. |
| `metadata.durationMs` | `number` \| `null` | Duração da faixa em milissegundos. |
| `metadata.genres` | `string[]` | Tags ou gêneros musicais catalogados nas bases. |
| `metadata.isrc` | `string` \| `null` | Código ISRC (International Standard Recording Code) exclusivo da gravação. |
| `metadata.coverUrl` | `string` \| `null` | Link da arte da capa do álbum em alta resolução (1000x1000). |
| `metadata.sources` | `object` | URLs diretas para os registros nos provedores consultados (`musicbrainz`, `itunes`, `deezer`). |
| `lyricPath` | `string` | Caminho relativo apontando para o arquivo de texto puro com a letra (`/lyrics/{id}.txt`). |
