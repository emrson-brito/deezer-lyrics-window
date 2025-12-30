# Deezer Lyrics Window

Uma aplicação Electron que monitora o Deezer Desktop no Windows e exibe as letras das músicas em uma janela flutuante sempre no topo.

## 🎵 Funcionalidades

- ✨ Detecta automaticamente a música tocando no Deezer Desktop
- 📝 Busca e exibe a letra da música em tempo real
- 📌 Janela flutuante que pode ficar sempre no topo
- 🎨 Interface moderna e minimalista
- 🔄 Atualização automática quando a música muda

## 🚀 Como usar

### Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn
- Deezer Desktop instalado no Windows

### Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd deezer-lyrics-window
```

2. Instale as dependências:
```bash
npm install
```

3. Execute a aplicação:
```bash
npm start
```

Para desenvolvimento com DevTools:
```bash
npm run dev
```

### Build

Para criar um executável:
```bash
npm run build
```

## 🛠️ Tecnologias utilizadas

- **Electron** - Framework para criar aplicações desktop
- **node-window-manager** - Para monitorar janelas do Windows
- **axios** - Para requisições HTTP
- **Lyrics.ovh API** - API gratuita para buscar letras

## 📋 Como funciona

1. A aplicação monitora as janelas abertas no Windows a cada 2 segundos
2. Quando detecta a janela do Deezer, extrai o título da música e artista
3. Busca a letra da música usando a API do Lyrics.ovh
4. Exibe a letra em uma janela flutuante e elegante

## 🎯 Estrutura do projeto

```
deezer-lyrics-window/
├── src/
│   ├── deezerMonitor.js    # Monitora o Deezer e detecta mudanças
│   └── lyricsService.js     # Busca letras das músicas
├── main.js                  # Processo principal do Electron
├── preload.js              # Script de preload (bridge IPC)
├── index.html              # Interface da janela
├── styles.css              # Estilos da aplicação
├── renderer.js             # Lógica do frontend
└── package.json            # Configurações e dependências
```

## 📝 Notas

- A aplicação depende do formato do título da janela do Deezer (geralmente "Artista - Música - Deezer")
- As letras são buscadas de uma API gratuita e podem não estar disponíveis para todas as músicas
- A janela começa sempre no topo por padrão, mas pode ser alternado pelo botão 📌

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

MIT
