# Guia de Adaptação: Execução da Esteira IA em Modo Embutido

**Documento:** Especificação Técnica de Mudanças para Modo Embutido  
**Perfil:** Arquiteto de Software Sênior  
**Data:** 25/09/2026  

---

## 1. Visão Geral do Cenário

Atualmente, a Esteira IA opera como um **Hub Externo Centralizado**: a ferramenta roda em sua própria pasta e gerencia um ou mais projetos apontando para seus respectivos caminhos de disco (`root_path`), injetando apenas o diretório `/gestao-ia/` no projeto monitorado.

Este documento detalha o que é tecnicamente necessário alterar para que a Esteira funcione **embutida**, isto é, copiada diretamente para dentro da árvore de arquivos de um projeto (por exemplo, em `meu-projeto/.esteira/` ou `meu-projeto/tools/esteira/`).

---

## 2. Mapa de Mudanças por Arquivo

Para operar de forma transparente dentro de um projeto hospedeiro, os seguintes componentes exigem alterações:

### 2.1. Configuração de Porta Dinâmica (`src/server.js`)
* **Problema:** A porta `3000` está fixada. Se dois projetos com Esteira embutida forem abertos simultaneamente, ocorrerá o erro `EADDRINUSE`.
* **Mudança necessária:**
  ```javascript
  // De:
  const PORT = 3000;

  // Para:
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  ```
* **Melhoria opcional:** Implementar tentativa sequencial (3000 -> 3001 -> 3002) se a porta estiver ocupada.

---

### 2.2. Detecção Automática da Raiz do Projeto Pai (`src/server.js` e `src/services/projectService.js`)
* **Problema:** A Esteira exige que o usuário acesse a interface web e clique em "Criar Projeto", digitando manualmente o `root_path`. No modo embutido, a Esteira deve saber automaticamente que o projeto a gerenciar é a pasta pai (`..`).
* **Mudança necessária:**
  1. Adicionar rotina de inicialização automática no bootstrap (`src/server.js`):
     ```javascript
     // Detectar se está rodando em subpasta
     const parentRoot = path.resolve(__dirname, '..', '..'); // Se estiver em meu-projeto/.esteira/src
     // Verificar se o projeto já está cadastrado no SQLite; se não, cadastrar automaticamente
     const existing = projectService.listProjects();
     if (existing.length === 0) {
         projectService.createProject({
             title: path.basename(parentRoot),
             description: 'Projeto gerenciado via Esteira Embutida',
             root_path: parentRoot
         });
     }
     ```
  2. Ajustar o frontend (`public/js/app.js`) para selecionar automaticamente o projeto único detectado, ocultando ou simplificando a tela de troca de projetos.

---

### 2.3. Isolamento do Banco de Dados SQLite (`src/db/database.js`)
* **Problema:** Por padrão, o banco `esteira.db` é gerado na raiz da Esteira. Se a pasta for versionada no Git do projeto hospedeiro, o arquivo binário `.db` gerará commits ruidosos a cada mudança de estado.
* **Mudança necessária:**
  1. Permitir configurar o caminho do banco por variável de ambiente:
     ```javascript
     const dbPath = process.env.ESTEIRA_DB_PATH || join(__dirname, '..', '..', 'esteira.db');
     ```
  2. Criar recomendação obrigatória para o `.gitignore` do projeto hospedeiro:
     ```gitignore
     # Ignorar dados e dependências da Esteira Embutida
     .esteira/esteira.db
     .esteira/esteira.db-journal
     .esteira/esteira.db-wal
     .esteira/node_modules/
     ```

---

### 2.4. Validação de Caminhos e Anti-Path-Traversal (`src/contracts/deliverySchema.js`)
* **Problema:** O validador sanitiza caminhos de entrega para garantir que fiquem contidos em `project.root_path`.
* **Atenção necessária:** Como a Esteira estará fisicamente dentro de `project.root_path` (ex: `meu-projeto/.esteira/`), é crucial garantir que a IA não altere os próprios arquivos da Esteira acidentalmente durante uma tarefa de código da aplicação.
* **Mudança necessária:**
  - Bloquear alterações entregues pela IA cujo caminho comece com `.esteira/` ou `tools/esteira/`.

---

## 3. Checklist Prático de Implantação do Modo Embutido

Quando for realizar a transição para o modo embutido, siga os passos:

1. **Preparar a pasta no projeto hospedeiro:**
   - Copiar a Esteira para uma pasta oculta ou de ferramentas (ex: `meu-projeto/.esteira`).
2. **Atualizar o `.gitignore` do projeto hospedeiro:**
   - Incluir `.esteira/node_modules/` e `.esteira/*.db*`.
3. **Aplicar as alterações de código:**
   - [ ] Habilitar `process.env.PORT` em `src/server.js`.
   - [ ] Implementar auto-registro da pasta pai como projeto padrão no bootstrap.
   - [ ] Adicionar trava no validador de entregas impedindo que a IA altere a pasta `.esteira/`.
4. **Adicionar scripts de conveniência no `package.json` do projeto hospedeiro:**
   ```json
   "scripts": {
     "esteira": "node .esteira/src/server.js"
   }
   ```

---

## 4. Alternativa de Longo Prazo: Pacote CLI (`npx esteira-ia`)

A forma mais limpa de obter os benefícios do modo embutido (iniciar diretamente dentro da pasta do projeto) sem os problemas de poluição de código é empacotar a Esteira como um comando CLI global:
* **Comando:** `npx esteira-ia start` executado na raiz do projeto.
* O CLI usa o diretório atual (`process.cwd()`) como `root_path`.
* O banco `esteira.db` é gravado no diretório de dados do usuário do sistema operacional (ex: `%APPDATA%/esteira-ia/` no Windows ou `~/.local/share/esteira-ia/` no Linux).
* O projeto hospedeiro recebe estritamente a pasta `/gestao-ia/`, mantendo 100% de separação de contextos.
