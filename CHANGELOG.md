# Histórico de versões

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); o projeto segue
[versionamento semântico](https://semver.org/lang/pt-BR/). Cada versão corresponde a uma tag `vX.Y.Z` e a uma
[release](https://github.com/6a8i/koine-ide/releases) com os instaladores.

## [0.2.0] - 2026-10-28

### Adicionado

- Instaladores para **Linux** (`.AppImage` e `.deb`, x86-64) e **macOS** (`.dmg` universal, Intel e Apple Silicon),
  gerados na mesma release que os do Windows. O site escolhe o arquivo do sistema do visitante.
- **Mensagens de erro do compilador e do interpretador nos dez idiomas**, incluindo nomes de tipos e descrições de
  tokens; comentários e textos dos exemplos também traduzidos.
- Site de documentação em <https://6a8i.github.io/koine-ide/> (guia da IDE, tour pela linguagem, referência, exemplos,
  idiomas), com vídeo de primeiro uso e imagem de pré-visualização para redes sociais.
- Política de segurança (`SECURITY.md`) com relato privado de vulnerabilidades; CodeQL, Dependabot e varredura de
  segredos; `main` protegida (só pull requests com commits assinados e CI verde).
- Guia de contribuição, código de conduta e modelos de issue e pull request.

### Corrigido

- Interface em português caía no dicionário inglês.
- Barra de ferramentas transbordava durante a depuração em janelas de largura média.
- Destaque de sintaxe do site perdia caracteres como `<`.

### Alterado

- TypeScript 7, Vite 8 e versões novas das actions de CI; `tauri-action` 1.

## [0.1.0] - 2026-10-27

Primeira versão pública.

- Linguagem **Koiné** (arquivos `.koi`): tipos, funções com passagem por referência, vetores e matrizes, bibliotecas
  `Matematica`, `Texto`, `Util` e `Tipos`, estruturas, classes com herança, referências seguras e módulos com
  `publico`/`privado`.
- Palavras reservadas, funções nativas, interface e referência em dez idiomas (português, inglês, espanhol, grego,
  russo, ucraniano, polonês, japonês, coreano e chinês), com conversão do código ao trocar.
- Editor com destaque, autocompletar e dicas; execução com console integrado; verificação de tipos e mensagens de erro
  didáticas; depurador com pontos de parada, passo a passo e variáveis ao vivo; testes automatizados com cobertura;
  projetos em pasta; referência (F1); exemplos.
- Instalador para Windows (`.exe` e `.msi`).

[0.2.0]: https://github.com/6a8i/koine-ide/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/6a8i/koine-ide/releases/tag/v0.1.0
