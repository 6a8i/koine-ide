// Gera os três manifestos do winget para uma versão publicada.
// Uso: node scripts/winget-manifests.mjs <versão> <sha256 do Koine.IDE_<versão>_x64-setup.exe> [owner/repo]
// Saída: winget/out/manifests/b/BznDigital/KoineIDE/<versão>/*.yaml  (estrutura que o winget-pkgs espera)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const [version, sha256, repo = "6a8i/koine-ide"] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("versão inválida: " + version);
if (!/^[0-9A-Fa-f]{64}$/.test(sha256 ?? "")) throw new Error("sha256 inválido: " + sha256);

export const PACKAGE_ID = "BznDigital.KoineIDE";
const [publisherSeg, nameSeg] = PACKAGE_ID.split(".");
const dir = resolve(`winget/out/manifests/${publisherSeg[0].toLowerCase()}/${publisherSeg}/${nameSeg}/${version}`);
rmSync(resolve("winget/out"), { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const url = `https://github.com/${repo}/releases/download/v${version}/Koine.IDE_${version}_x64-setup.exe`;
const date = new Date().toISOString().slice(0, 10);

const versionManifest = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.1.9.0.schema.json
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${version}
DefaultLocale: pt-BR
ManifestType: version
ManifestVersion: 1.9.0
`;

const installerManifest = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.1.9.0.schema.json
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${version}
InstallerLocale: pt-BR
Platform:
- Windows.Desktop
MinimumOSVersion: 10.0.17763.0
InstallerType: nullsoft
Scope: user
InstallModes:
- interactive
- silent
- silentWithProgress
UpgradeBehavior: install
FileExtensions:
- koi
ReleaseDate: ${date}
Installers:
- Architecture: x64
  InstallerUrl: ${url}
  InstallerSha256: ${sha256.toUpperCase()}
ManifestType: installer
ManifestVersion: 1.9.0
`;

const localeManifest = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.9.0.schema.json
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${version}
PackageLocale: pt-BR
Publisher: Bzn Digital
PublisherUrl: https://github.com/6a8i
PublisherSupportUrl: https://github.com/${repo}/issues
Author: Gabriele Bizzon
PackageName: Koiné IDE
PackageUrl: https://6a8i.github.io/koine-ide/
License: MIT
LicenseUrl: https://github.com/${repo}/blob/main/LICENSE
Copyright: Copyright (c) 2026 Gabriele Bizzon
ShortDescription: IDE para aprender programação com pseudocódigo no seu idioma
Description: |-
  Koiné IDE é um ambiente gratuito e leve para os primeiros passos em programação. A linguagem Koiné é um
  pseudocódigo com tipos, funções, estruturas e classes cujas palavras reservadas existem em dez idiomas
  (português, inglês, espanhol, grego, russo, ucraniano, polonês, japonês, coreano e chinês). Traz editor com
  destaque de sintaxe, execução com console, mensagens de erro didáticas, depurador visual, testes automatizados
  com cobertura e projetos em vários arquivos.
Moniker: koine-ide
Tags:
- educacao
- education
- ide
- koine
- portugol
- programacao
- pseudocodigo
- pseudocode
ReleaseNotesUrl: https://github.com/${repo}/releases/tag/v${version}
Documentations:
- DocumentLabel: Guia da IDE
  DocumentUrl: https://6a8i.github.io/koine-ide/guia.html
ManifestType: defaultLocale
ManifestVersion: 1.9.0
`;

writeFileSync(`${dir}/${PACKAGE_ID}.yaml`, versionManifest);
writeFileSync(`${dir}/${PACKAGE_ID}.installer.yaml`, installerManifest);
writeFileSync(`${dir}/${PACKAGE_ID}.locale.pt-BR.yaml`, localeManifest);
console.log(`manifestos em ${dir}`);
