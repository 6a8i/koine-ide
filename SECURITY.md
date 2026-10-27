# Política de segurança

## Versões com suporte

Só a versão mais recente publicada em [Releases](https://github.com/6a8i/koine-ide/releases/latest) recebe correções.
Atualize antes de relatar um problema.

## Relatando uma vulnerabilidade

Encontrou algo que possa comprometer quem usa o Koiné IDE (execução de código fora do interpretador, leitura ou escrita de
arquivos além do que a interface permite, problemas no instalador ou na pipeline de release)? **Não abra uma issue
pública.** Use o relato privado do GitHub:

**<https://github.com/6a8i/koine-ide/security/advisories/new>**

Inclua a versão, o sistema operacional, os passos para reproduzir e, se possível, um programa `.koi` ou arquivo que
demonstre o problema. Você recebe uma primeira resposta em até 7 dias. Depois de corrigido, publicamos um aviso de
segurança com crédito a quem relatou, salvo pedido em contrário.

Programas escritos em Koiné rodam num interpretador próprio, dentro de uma *Web Worker*, sem acesso ao sistema de
arquivos nem à rede; a parte nativa (Rust/Tauri) expõe só os comandos de abrir, salvar, listar e renomear arquivos que a
interface usa. Qualquer forma de escapar desse isolamento é considerada vulnerabilidade.

## Como o projeto se protege

- A branch `main` só recebe mudanças por pull request, com commits assinados e verificados, histórico linear, conversas
  resolvidas e a integração contínua verde (testes do interpretador, validador de idiomas, build, `cargo fmt`/`clippy`).
  Ninguém, nem os mantenedores, envia diretamente para a `main` ou força push.
- Tags de release (`v*`) só podem ser criadas por mantenedores e também precisam ser assinadas.
- Os instaladores são gerados exclusivamente pelo GitHub Actions a partir da tag, com o registro público de cada build;
  nenhum binário é compilado em máquina pessoal.
- Workflows de forks precisam de aprovação manual antes de rodar; o `GITHUB_TOKEN` tem só permissão de leitura por
  padrão, e apenas actions do GitHub, de criadores verificados ou de uma lista explícita podem ser usadas.
- Dependabot (atualizações mensais e correções de segurança), CodeQL em cada mudança e varredura de segredos com
  bloqueio de push estão ativos.
- Dependências do frontend são fixadas pelo `package-lock.json` e as do Rust pelo `Cargo.lock`.
