# Decisões de Arquitetura e Engenharia da Ferramenta

**Data:** 24/09/2026  
**Documento de Origem:** Especificação v1.0 da Esteira de Desenvolvimento com IA  
**Perfil:** Arquiteto de Software Sênior & Engenharia de Sistemas  

---

## 1. Stack Tecnológica Selecionada

### Backend e Persistência
- **Ambiente:** Node.js v24.15.0 (LTS moderna já disponível no ambiente local).
- **Banco de Dados:** SQLite nativo via módulo padrão `node:sqlite` (`DatabaseSync`), sem compilações externas C++ ou pacotes binários instáveis no Windows.
- **Servidor HTTP:** Servidor HTTP local nativo/estruturado, escutando estritamente em `127.0.0.1` (localhost), sem exposição à rede externa.
- **Racional:** Zero dependências de compilação C++, portabilidade instantânea no Windows, persistência transacional com suporte a ACID e operações atômicas.

### Interface do Usuário (Frontend)
- **Estrutura e Estilo:** HTML5 semântico com Vanilla CSS moderno.
- **Design System:** Tema escuro refinado (Dark Mode elegante, paleta de cores HSL, tipografia moderna via fontes de sistema de alta legibilidade, contraste em conformidade com WCAG, ícones semânticos SVG e indicadores de texto em alertas para acessibilidade).
- **Lógica de Interface:** Vanilla JavaScript modular (ESM), sem frameworks pesados ou geradores de build complexos, garantindo carregamento instantâneo offline após instalação.
- **Kanban Interativo:** Suporte a Drag & Drop nativo via HTML5 Drag and Drop API acoplado a validações de pré-requisitos antes de solicitar a transição.

---

## 2. Padrões de Persistência e Documentação Sincronizada

- **Fonte Oficial da Verdade:** Banco SQLite local (`esteira.db`).
- **Espelho em Markdown:** Diretório `/gestao-ia` na raiz de cada projeto selecionado, contendo:
  - `Projeto.md` (objetivo, escopo, requisitos, arquitetura, regras de negócio e critérios de aceite).
  - `Tarefas.md` (tarefas, dependências, responsáveis, etapas, situações, entregas e próximas ações).
  - `Decisões.md` (propostas de mudanças, impactos, alternativas e deliberação humana).
  - `Validação.md` (plano de testes, comandos, resultados, erros, tentativas e aprovações).
- **Garantia de Integridade:**
  - A escrita dos 4 arquivos Markdown é atômica (gravação em `.tmp` seguida de substituição via `renameSync`).
  - Hash SHA-256 é armazenado no banco para cada versão exportada.
  - Edições externas nos arquivos Markdown são detectadas por divergência de hash, bloqueando avanços silenciosos e exigindo conciliação explícita.
- **Subdiretórios da Gestão IA:**
  - `entrada/`: recepção de entregas (`.tmp` -> `.json`).
  - `processados/`: arquivo movido após ingestão válida.
  - `rejeitados/`: arquivo movido com relatório de erros em caso de rejeição.
  - `evidencias/`: relatórios e logs de execuções.
  - `contexto/`: notas e contextos exportáveis.
  - `prompts/`: prompts gerados salvos para rastreabilidade.

---

## 3. Contrato de Entrega e Ingestão

- **JSON Schema v1.0:** Validação estrita de todos os campos obrigatórios.
- **Proteção de Diretórios:** Sanitização absoluta de caminhos de arquivos (`files[].path`) contra path traversal (bloqueio de `..`, caminhos absolutos arbitrários ou caracteres de escape).
- **Idempotência:** Cálculo de hash SHA-256 do payload JSON. Se um `submission_id` já existente for recebido com o mesmo hash, a resposta é idempotente sem duplicar eventos. Se recebido com hash diferente, acusa conflito de submissão.
- **Observador de Arquivos:** Polling/Watch da pasta `/gestao-ia/entrada`, processando apenas arquivos `.json` fechados (ignorando arquivos temporários `.tmp`).

---

## 4. Decisões Pendentes de Deliberação do Usuário

1. **DEC-PEND-001: Política de Suspensão de Funcionalidade por Limite de Tentativas**
   - *Proposta:* Suspender a funcionalidade e exigir decisão humana após 3 rodadas de correção reprovadas da funcionalidade (e não após 3 bugs individuais encontrados na etapa Verificar).
   - *Status:* Proposta técnica cadastrada como Decisão Pendente, respeitando o rito de que propostas do prompt não são declaradas como escolhas pré-aprovadas.

---

## 5. Arquitetura do Tutorial Interativo e Onboarding

- **Modelo de Dados:** Tabela `tutorial_state` isolada no SQLite por `project_id`, armazenando `enabled`, `current_step`, `completed_steps` (JSON), `communication_mode`, `connection_token`, `connection_verified` e `shown_tips`.
- **Avaliação Dinâmica de Progresso:** O progresso do tutorial não depende de flags artificiais ou simulações. A conclusão de cada passo é validada diretamente contra as evidências operacionais do projeto (existência da pasta e markdowns, IAs cadastradas, criação de tarefas, execuções autorizadas e entregas aceitas).
- **Regra Anti-Avanço por Cópia:** O simples ato de clicar em "Copiar prompt" não avança a esteira nem conclui tarefas. O avanço só ocorre após a comprovação técnica da etapa.
- **Teste de Conexão com Token Temporário:** Para comprovação do acesso local da IA, o backend gera um token descartável (`CONFIRM-IA-...`) e verifica se a IA criou o arquivo temporário `.esteira_confirmacao.tmp` com o conteúdo exato. O arquivo é excluído imediatamente após a confirmação.
- **Dicas Contextuais:** Sistema não obstrusivo que apresenta orientações pontuais na primeira ocorrência de eventos como decisões pendentes, testes não executados, reprovações e suspensões por limite de tentativas.

