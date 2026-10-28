# Publicação no winget

O Koiné IDE é publicado no repositório comunitário [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs)
com o identificador **`BznDigital.KoineIDE`**. Depois de aceito, qualquer Windows 10/11 instala com:

```
winget install BznDigital.KoineIDE
```

## Como funciona

- `scripts/winget-manifests.mjs` gera os três manifestos (versão, instalador e idioma padrão) a partir da versão e do
  SHA-256 do instalador `.exe` (NSIS) já publicado na release.
- O job **Publica no winget** do workflow de release roda em toda tag `vX.Y.Z`: baixa o instalador da release, calcula o
  hash, gera os manifestos e envia o pull request para o winget-pkgs com o
  [wingetcreate](https://github.com/microsoft/winget-create). A revisão do PR é feita pela automação e pelos
  moderadores do winget, normalmente em 1 a 3 dias.
- O job precisa do segredo **`WINGET_TOKEN`**: um *personal access token* (clássico) do GitHub com o escopo
  `public_repo`, da conta que vai aparecer como autora dos PRs no winget-pkgs. Sem o segredo, o job só avisa e nada é
  enviado. Para criar: GitHub → *Settings* → *Developer settings* → *Personal access tokens* → *Tokens (classic)* →
  *Generate new token* com `public_repo`; depois, no repositório, *Settings* → *Secrets and variables* → *Actions* →
  *New repository secret* chamado `WINGET_TOKEN`.

## Envio manual

Para enviar sem a pipeline (por exemplo, a primeira vez, para acompanhar a revisão de perto):

```powershell
$v = "0.2.0"
Invoke-WebRequest "https://github.com/6a8i/koine-ide/releases/download/v$v/Koine.IDE_${v}_x64-setup.exe" -OutFile setup.exe
$sha = (Get-FileHash setup.exe -Algorithm SHA256).Hash
node scripts/winget-manifests.mjs $v $sha
winget install wingetcreate          # uma vez
wingetcreate submit --token <PAT> winget/out/manifests/b/BznDigital/KoineIDE/$v
```

Para validar os manifestos localmente antes de enviar: `winget validate --manifest winget/out/manifests/b/BznDigital/KoineIDE/$v`
(precisa de `winget settings --enable LocalManifestFiles` uma vez, como administrador).

## Observações

- O instalador não é assinado; o winget aceita, porque valida o hash do arquivo. Quando a assinatura do SignPath
  entrar, nada muda aqui.
- O winget só aceita versões maiores que a última publicada; não reenvie uma versão já aceita.
- O identificador e o nome do editor (`Bzn Digital`) devem bater com o `Publisher` gravado no instalador
  (`bundle.publisher` em `src-tauri/tauri.conf.json`); os moderadores verificam.
