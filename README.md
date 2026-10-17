# Prompt Enhancer

Mod do Claude Code que coloca dois botões logo acima da caixa de prompt, **✦ Enhance** e **➤ Send**.

**Enhance** reescreve o seu rascunho no próprio lugar, sem enviar. A nova versão traz:

- a tarefa reescrita com clareza, na língua do rascunho;
- as skills instaladas que combinam com a tarefa (`/nome`);
- detalhes relevantes do projeto atual;
- as decisões que o Claude deve perguntar antes de começar;
- o que define o trabalho pronto.

Você revisa, ajusta e envia.

## Uso

| Ação | Como |
| --- | --- |
| Melhorar o rascunho | `alt+e` na caixa de prompt, ou o chip **✦ Enhance** |
| Enviar | **➤ Send** (ou Enter, como sempre) |
| Voltar ao rascunho original | **↶ Desfazer**, que aparece depois de melhorar |
| Parar uma reescrita | **Cancelar**, que aparece enquanto ela roda |
| Melhorar um texto direto | `/enhance <texto>` |
| Escolher modelo e esforço | `/prompt-enhancer` (veja [Configuração](#configuração)) |
| Usar só o teclado na faixa | `ctrl+x tab` foca o Enhance, `Tab` anda entre os botões, `Esc` volta ao prompt |

Enquanto o modelo trabalha, a faixa mostra o andamento. Se você editar o rascunho nesse meio-tempo, a sua versão vence e nada é trocado.

## O atalho

Nesta versão, um mod não consegue registrar atalho global sozinho. O `alt+e` vem de uma linha em `~/.claude/keybindings.json` que roda o comando `/enhance` do mod sem limpar a caixa:

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    { "context": "Chat", "bindings": { "alt+e": "command:enhance" } }
  ]
}
```

Para usar outra tecla, troque `alt+e`. A dica na faixa lê esse arquivo e mostra a tecla configurada.

## O que vai para o modelo

A cada Enhance, o mod monta e envia, pelo mesmo cliente e conta da sua sessão:

- **Skills:** a lista de comandos e skills que você pode rodar (`$.command.list()`), sem o próprio `/enhance`.
- **Projeto:** git (remote sem credenciais, status, últimos commits), a estrutura de pastas até dois níveis, os manifestos (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` e outros) e trechos de `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, `README.md` e `tasks.md`.
- **Conversa:** as últimas 6 mensagens da sessão, resumidas.

A lista de skills vai primeiro, marcada para o cache de prompt da API.

A reescrita sai na língua do rascunho, mesmo que o seu `language` do Claude Code seja outro, porque o texto é o seu prompt e não uma resposta para você. O mod reconhece inglês e português sozinho e entrega ao modelo os rótulos certos; em outras línguas, quem decide é o próprio modelo.

## Configuração

O mod tem o próprio comando, `/prompt-enhancer`, e não aparece no `/config`. São duas escolhas:

- **Modelo da reescrita:** `sonnet` (padrão), `opus` ou `haiku`. O `opus` reescreve melhor, mas é mais lento e gasta mais; o `haiku` é o mais rápido.
- **Esforço da reescrita:** `low`, `medium` (padrão) ou `high`. É quanto o modelo pensa antes de reescrever.

Há dois jeitos de escolher:

- `/prompt-enhancer` sozinho abre uma linha na faixa, acima do Enhance, com as duas listas. `ctrl+x tab` leva o foco à lista de modelo, as setas trocam o valor, Enter escolhe, `Tab` passa para o esforço e **Fechar** some com a linha. A resposta do comando também mostra o que está valendo.
- `/prompt-enhancer opus high` salva direto, sem abrir a linha. Dá para passar só um dos dois (`/prompt-enhancer haiku`, `/prompt-enhancer low`).

A escolha fica guardada num arquivo do próprio mod, na pasta de configuração do Claude Code, e vale em todas as sessões a partir do próximo Enhance. No app mobile a linha com as listas não aparece; use a forma digitada.

## Instalar em todas as sessões

Este repositório também é um marketplace. No terminal, uma vez:

```
claude plugin marketplace add carreirodev/mod-prompt-enhancer
```

```
claude plugin install prompt-enhancer@prompt-enhancer
```

Para receber uma versão nova, rode `claude plugin update prompt-enhancer@prompt-enhancer` e depois `/reload-plugins` numa sessão aberta.

Para mexer no mod, adicione o marketplace pela pasta clonada em vez do GitHub (`claude plugin marketplace add C:\caminho\do\clone`). Assim o Claude Code lê o mod direto dessa pasta, e depois de editar basta rodar `/reload-plugins` numa sessão aberta.

## Limitações conhecidas

- **Send** não leva colagens nem imagens (`[Pasted text #1]`, `[Image #1]`), porque um prompt enviado por mod não as expande. Nesses casos o botão avisa, e você envia com Enter.
- Um prompt enviado pelo **Send** aparece no transcript marcado como vindo do `prompt-enhancer`, mas o modelo o lê como palavras suas.
- A faixa existe no terminal e no app desktop; o mobile e o VS Code não desenham essa área.
- Com o mod desinstalado, o `alt+e` responde que `/enhance` não existe. Remova a linha do `keybindings.json` nesse caso.

## Desenvolvimento

```
claude plugin validate .
```

```
claude plugin test .
```

O type-check usa o `tsconfig.json` da raiz, que estende os tipos que o Claude Code grava em `.claude-plugin/types/` ao carregar o mod.
