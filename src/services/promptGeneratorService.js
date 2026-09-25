import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { VALID_STAGES, VALID_FILE_OPERATIONS, VALID_TEST_STATUSES } from '../contracts/deliverySchema.js';

export class PromptGeneratorService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Gera o prompt oficial de retomada de tarefa conforme a Seção 10 da especificação.
     * Fornece instrução exata de O QUE FAZER, COMO FAZER, PROIBIÇÕES ESPECÍFICAS
     * e o modelo de arquivo JSON obrigatório para garantir entrega determinística.
     */
    generateTaskPrompt(executionId) {
        const exec = this.db.db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId);
        if (!exec) throw new Error(`Execução ${executionId} não encontrada.`);

        const task = this.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(exec.task_id);
        const feature = this.db.db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

        let resources = [];
        try { resources = JSON.parse(exec.reserved_resources); } catch {}
        const recursosStr = resources.length > 0 ? resources.join(', ') : 'Nenhum arquivo exclusivo reservado.';

        const previousRef = task.last_delivery_ref || 'nenhuma (primeira entrega desta esteira)';
        const submissionId = `SUB-${exec.id}-${task.id}-R${project.revision}`;
        const jsonFileName = `${submissionId}.json`;
        const entradaPath = join(project.root_path, 'gestao-ia', 'entrada');
        const jsonFullPath = join(entradaPath, jsonFileName);

        // Próxima etapa sugerida padrão conforme máquina de estados
        const nextStageMap = {
            'Definir': 'Desenvolver',
            'Desenvolver': 'Verificar',
            'Verificar': 'Corrigir',
            'Corrigir': 'Verificar',
            'Validar': 'Validar'
        };
        const nextStage = nextStageMap[exec.stage] || 'Desenvolver';

        // Diretrizes específicas da etapa
        const directives = this.getStageDirectives(exec.stage, task, feature);

        // Template JSON estritamente compatível com o Schema v1.0
        const jsonTemplate = {
            schema_version: "1.0",
            submission_id: submissionId,
            project_id: project.id,
            feature_id: feature.id,
            task_id: task.id,
            execution_id: exec.id,
            stage: exec.stage,
            actor_id: exec.actor_id,
            previous_delivery_ref: task.last_delivery_ref || null,
            base_revision: project.revision,
            title: `Entrega da etapa ${exec.stage}: ${task.title.trim()}`,
            description: `[Descreva com clareza o que foi entregue nesta rodada de ${exec.stage}]`,
            context_read: [
                "gestao-ia/Projeto.md",
                "gestao-ia/Tarefas.md",
                "gestao-ia/Decisões.md",
                "gestao-ia/Validação.md"
            ],
            code_version: {
                commit: "HEAD",
                dirty: false
            },
            files: [],
            logic_changes: [
                `[Descreva as decisões de lógica ou implementação tomadas]`
            ],
            tests: [
                {
                    test_id: `TST-${task.id}-01`,
                    title: `Validação de conformidade da etapa ${exec.stage}`,
                    status: "not_run",
                    reason: "[Substitua pelo motivo real de não ter executado este teste; se executado, atualize status e registre evidências]",
                    evidence: []
                }
            ],
            errors: [],
            handoff_notes: `[Orientações claras para a conferência humana ou para a próxima etapa (${nextStage})]`,
            recommended_next_stage: nextStage
        };

        const jsonTemplateString = JSON.stringify(jsonTemplate, null, 2);

        const promptText = `================================================================================
INSTRUÇÃO OFICIAL DA ESTEIRA DE DESENVOLVIMENTO COM IA
================================================================================

[AVISO CRÍTICO DE EXECUÇÃO: REGRA DE CONCLUSÃO DA ESTEIRA]
Esta esteira é automatizada e orientada a arquivos no disco.
O ÚNICO GATILHO que faz o sistema reconhecer o seu trabalho e avançar a etapa no Kanban é a GRAVAÇÃO FÍSICA do arquivo JSON da entrega no caminho exato:
>>> ${jsonFullPath}
Sem este arquivo JSON gravado no disco, a esteira NÃO avança, o Kanban NÃO atualiza e a etapa será considerada NÃO REALIZADA. Relatórios em texto no chat ou arquivos Markdown soltos NÃO concluem a etapa!

--------------------------------------------------------------------------------
1. IDENTIFICAÇÃO E AUTORIZAÇÃO DE TRABALHO
- Projeto: ${project.title} (${project.id})
- Raiz Local do Projeto: ${project.root_path}
- Revisão Base Atual: ${project.revision}
- Execução Autorizada: ${exec.id}
- Tarefa Vinculada: ${task.id} (${task.title})
- Funcionalidade Vinculada: ${feature.id} (${feature.title})
- Etapa Obrigatória Atual: ${exec.stage}
- IA Responsável / Ator: ${exec.actor_id}
- Referência de Entrega Anterior: ${previousRef}

Trabalhe no projeto ${project.title} (${project.id}), raiz ${project.root_path}, revisão ${project.revision}. Sua execução autorizada é ${exec.id}, tarefa ${task.id} (${task.title}), etapa ${exec.stage}, referência anterior ${previousRef}.

--------------------------------------------------------------------------------
2. PROTOCOLO OBRIGATÓRIO DE LEITURA (EXECUTE ANTES DE QUALQUER MODIFICAÇÃO)
- Você DEVE ler os arquivos de governança da esteira antes de agir:
  leia Projeto.md, Tarefas.md, Decisões.md e Validação.md em /gestao-ia e os anexos relevantes listados em gestao-ia/Projeto.md, gestao-ia/Tarefas.md, gestao-ia/Decisões.md, gestao-ia/Validação.md.
- Confirme os objetivos, critérios de aceite, dependências e histórico de erros.
- Informe explicitamente o que consultou. Se não conseguir acessar conteúdo necessário, pare e registre o impedimento.
- Não invente informações nem declare leitura ou teste que não realizou.

--------------------------------------------------------------------------------
3. O QUE FAZER (MISSÃO ESPECÍFICA DA ETAPA: ${exec.stage})
Objetivo: ${directives.goal}
Escopo Autorizado: ${exec.scope}
Recursos / Arquivos Reservados: ${recursosStr}

Passo a Passo Obrigatório:
${directives.instructions.join('\n')}

--------------------------------------------------------------------------------
4. COMO FAZER (INSTRUÇÕES OPERACIONAIS DE GRAVAÇÃO)
- Se você é um Agente, IDE ou CLI com acesso a ferramentas de escrita/terminal:
  1. Execute a análise e modificações necessárias no projeto.
  2. Se gerar documentos auxiliares em Markdown (ex: especificações), salve-os em:
     ${entradaPath}
  3. Preencha todos os campos do template JSON fornecido na Seção 7 e confira as regras obrigatórias antes de enviar.
  4. OBRIGATÓRIO: Grave fisicamente o arquivo JSON no disco no caminho exato:
     ${jsonFullPath}
- Se você é um Modelo de Chat Web sem acesso direto a arquivos (ex: ChatGPT Web, Claude Web):
  1. Forneça o conteúdo integral dos arquivos criados.
  2. No início da sua resposta, ALERTE O OPERADOR com destaque:
     "AÇÃO OBRIGATÓRIA: Salve o arquivo JSON abaixo em ${jsonFullPath} ou cole-o no botão 'Importar Entrega' da esteira para que o Kanban avance."
  3. Entregue o JSON completo e válido pronto para ser copiado.

--------------------------------------------------------------------------------
5. ONDE SALVAR CADA ARQUIVO (CAMINHOS ABSOLUTOS E NOMES EXATOS)
- Arquivo JSON da Entrega (MANDATÓRIO PARA AVANÇAR A ESTEIRA):
  >>> ${jsonFullPath}
  (Nome: ${jsonFileName} | Pasta: ${entradaPath})
- Documentos Auxiliares em Markdown (.md) desta etapa (se houver):
  >>> ${entradaPath}/[nome-do-documento].md
  (Todos os documentos criados DEVEM ser listados no array "files" do arquivo JSON acima)
- Arquivos de Código-Fonte da Aplicação (nas etapas de Desenvolver/Corrigir):
  >>> Devem ser criados/alterados na estrutura do projeto sob: ${project.root_path}
  (Todos os arquivos alterados DEVEM ser listados no array "files" do arquivo JSON acima)

--------------------------------------------------------------------------------
6. O QUE NÃO FAZER (REGRAS NEGATIVAS MANDATÓRIAS - ZERO DUPLA INTERPRETAÇÃO)
${directives.prohibitions.join('\n')}
- PROIBIDO: Não encerre sua resposta sem gerar o arquivo ${jsonFileName} no caminho exato ${jsonFullPath}.
- PROIBIDO: Mudanças de requisito exigem decisão humana prévia registrada em gestao-ia/Decisões.md.
- PROIBIDO: Execute somente o escopo autorizado: ${exec.scope}. Respeite os recursos reservados: ${recursosStr}.
- PROIBIDO: Não inicie outra etapa do rito por conta própria.

--------------------------------------------------------------------------------
7. CONTRATO JSON DA ENTREGA (PREENCHA E GRAVE ESTE ARQUIVO)
REGRAS OBRIGATÓRIAS DE PREENCHIMENTO — A AUSÊNCIA INVALIDA A ENTREGA:
- Entregue um objeto JSON válido, sem comentários ou vírgulas finais. No arquivo .json, não inclua cercas Markdown.
- Preserve schema_version "1.0" e os valores fornecidos para submission_id, project_id, feature_id, task_id, execution_id, stage, actor_id, previous_delivery_ref e base_revision. Não invente IDs ou altere a autorização. previous_delivery_ref deve permanecer null na primeira entrega; base_revision é um número inteiro, não uma string.
- title e description são textos obrigatórios e não vazios, descrevendo o trabalho real.
- context_read, files, logic_changes e tests são obrigatoriamente arrays, mesmo quando vazios ([]). Não substitua arrays por texto ou objetos. Registre somente contexto realmente consultado.
- code_version é um objeto: informe commit ou manifest_ref real e dirty de acordo com o estado observado; não copie HEAD/false sem verificar.
- Cada item de files deve conter path relativo à raiz do projeto e operation com um destes valores exatos: ${VALID_FILE_OPERATIONS.join(', ')}. Não use caminhos absolutos nem caminhos que escapem da raiz com .. .
- Cada item de tests deve conter test_id e status. Valores exatos de status: ${VALID_TEST_STATUSES.join(', ')}.
- OBRIGATÓRIO PARA CADA TESTE COM status "not_run": inclua reason como texto não vazio, explicando o motivo real de esse teste não ter sido executado. Uma justificativa geral em description ou handoff_notes NÃO substitui tests[i].reason. Esta regra vale também na etapa Definir.
- Exemplo de teste não executado: {"test_id":"TST-${task.id}-01","status":"not_run","reason":"Teste funcional depende da implementação, fora do escopo desta etapa de definição."}. Use esse motivo SOMENTE se corresponder à situação real.
- Nunca altere not_run para passed para contornar a validação. Não invente execução, resultado ou evidência. Registre testes previstos e não executados com not_run e reason; não os apague para evitar justificar.
- Preencha errors e handoff_notes conforme o trabalho realizado. recommended_next_stage, quando informado, deve ser um destes valores exatos: ${VALID_STAGES.join(', ')}; é uma recomendação, não autorização para iniciar outra etapa.
- Substitua TODOS os textos de orientação entre colchetes por informações reais. Se faltar informação, registre o impedimento com clareza, sem fabricar dados.

Preencha os campos entre colchetes [...] e salve exatamente como ${jsonFileName} em ${jsonFullPath}:

${jsonTemplateString}

================================================================================
VERIFICAÇÃO FINAL:
Antes de enviar, releia o JSON inteiro e confira cada regra da Seção 7, inclusive TODOS os itens de tests. Para cada status not_run, verifique a presença de reason preenchido com o motivo real. Corrija qualquer omissão antes de gravar a entrega.
Confira se o JSON pode ser interpretado, se os arrays e IDs estão corretos e se não restaram placeholders. Grave primeiro em um arquivo .tmp e só renomeie para .json após terminar a conferência, evitando importação de arquivo incompleto.
Gravar o arquivo não significa que ele foi aceito: uma entrega válida fica aguardando conferência humana. Se houver rejeição em gestao-ia/rejeitados, leia o arquivo .rejection.json correspondente e corrija os erros informados antes de reenviar. Não declare que a tarefa avançou sem confirmação.
Certifique-se de que o arquivo ${jsonFileName} está gravado fisicamente em:
${jsonFullPath}
Informe o resumo objetivo das alterações e a referência ${submissionId} para a conferência humana.
================================================================================`;

        // Salvar cópia em gestao-ia/prompts/ se o diretório existir
        try {
            const promptsDir = join(project.root_path, 'gestao-ia', 'prompts');
            if (existsSync(promptsDir)) {
                const promptFile = join(promptsDir, `${exec.id}_${task.id}.txt`);
                writeFileSync(promptFile, promptText, 'utf8');
            }
        } catch {}

        return {
            executionId: exec.id,
            taskId: task.id,
            stage: exec.stage,
            submissionId,
            jsonFileName,
            jsonFullPath,
            promptText
        };
    }

    /**
     * Gera o prompt oficial determinístico para criação da estrutura /gestao-ia do zero.
     */
    generatePrepDocsPrompt(projectId) {
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

        const baseDir = join(project.root_path, 'gestao-ia');
        const now = new Date().toISOString();

        return {
            projectId: project.id,
            rootPath: project.root_path,
            baseDir,
            promptText: `================================================================================
INSTRUÇÃO OFICIAL: CRIAÇÃO DA ESTRUTURA DOCUMENTAL /gestao-ia DO ZERO
================================================================================

1. IDENTIFICAÇÃO DO PROJETO
- Projeto: ${project.title} (${project.id})
- Raiz Local do Projeto: ${project.root_path}
- Pasta Obrigatória da Esteira: ${baseDir}

--------------------------------------------------------------------------------
2. O QUE FAZER:
Criar a pasta "gestao-ia" na raiz do projeto, as 6 subpastas de trabalho e os 4 arquivos Markdown oficiais de governança.

--------------------------------------------------------------------------------
3. ONDE SALVAR (ESTRUTURA COMPLETA DE DIRETÓRIOS E ARQUIVOS):
Crie os seguintes diretórios sob ${project.root_path}:
- ${baseDir}/entrada
- ${baseDir}/processados
- ${baseDir}/rejeitados
- ${baseDir}/evidencias
- ${baseDir}/contexto
- ${baseDir}/prompts

Crie os 4 arquivos Markdown oficiais diretamente em ${baseDir}/:
1. ${baseDir}/Projeto.md
2. ${baseDir}/Tarefas.md
3. ${baseDir}/Decisões.md
4. ${baseDir}/Validação.md

--------------------------------------------------------------------------------
4. COMO FAZER (CONTEÚDO EXATO DOS 4 ARQUIVOS MARKDOWN):

--- ARQUIVO 1: ${baseDir}/Projeto.md ---
# ${project.title} (${project.id})

> Revisão Oficial: ${project.revision} | Inicializado em: ${now}

## Objetivo do Projeto
${project.description || 'Definição do escopo e arquitetura do projeto.'}

## Raiz Local
\`${project.root_path}\`

## Funcionalidades e Requisitos
*Nenhuma funcionalidade cadastrada ainda. Utilize o dashboard para planejar.*

--- ARQUIVO 2: ${baseDir}/Tarefas.md ---
# Tarefas da Esteira — ${project.title} (${project.id})

> Revisão do Projeto: ${project.revision} | Sincronizado em: ${now}

*Nenhuma tarefa cadastrada nesta funcionalidade.*

--- ARQUIVO 3: ${baseDir}/Decisões.md ---
# Registro de Decisões — ${project.title} (${project.id})

> Decisões arquiteturais, mudanças de escopo e deliberações humanas

*Nenhuma decisão registrada até o momento.*

--- ARQUIVO 4: ${baseDir}/Validação.md ---
# Validação e Homologação — ${project.title} (${project.id})

> Histórico de verificações técnicas, correções e homologações humanas

*Nenhuma validação executada até o momento.*

--------------------------------------------------------------------------------
5. O QUE NÃO FAZER (PROIBIÇÕES MANDATÓRIAS):
- PROIBIDO: Não crie nem altere nenhum arquivo de código-fonte da aplicação.
- PROIBIDO: Não invente requisitos, funcionalidades ou tarefas concluídas.
- PROIBIDO: Não apague nem sobrescreva arquivos pré-existentes na raiz do projeto.
- PROIBIDO: Não inicie desenvolvimento nesta etapa de preparação documental.
================================================================================`
        };
    }

    getStageDirectives(stage, task, feature) {
        switch (stage) {
            case 'Definir':
                return {
                    goal: `Definir requisitos técnicos, arquiteturais e critérios de aceitação para '${task.title.trim()}'.`,
                    instructions: [
                        `1. Analise o objetivo da funcionalidade '${feature.title}' e da tarefa '${task.title}'.`,
                        `2. Descreva claramente os critérios de aceitação que a implementação precisará cumprir.`,
                        `3. Se gerar documentação auxiliar (especificação ou análise em Markdown), salve o arquivo com extensão .md dentro da pasta gestao-ia/entrada/.`,
                        `4. Declare os arquivos de documentação criados no campo "files" do JSON de entrega.`,
                        `5. Preencha e salve obrigatoriamente o arquivo JSON formal de entrega na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não altere nem crie arquivos de código-fonte da aplicação nesta etapa.`,
                        `PROIBIDO: Não inicie o desenvolvimento ou implementação de código nesta etapa.`,
                        `PROIBIDO: Não encerre o trabalho sem salvar o arquivo JSON formal de entrega.`
                    ]
                };

            case 'Desenvolver':
                return {
                    goal: `Implementar estritamente o código e as regras para '${task.title.trim()}'.`,
                    instructions: [
                        `1. Consulte os requisitos aprovados em gestao-ia/Tarefas.md e gestao-ia/Projeto.md.`,
                        `2. Escreva o código funcional e completo na base do projeto (sem placeholders, TODOs ou mocks).`,
                        `3. Liste cada arquivo criado ou modificado no array "files" do JSON de entrega com o caminho relativo (ex: "src/modulo.js") e operação ("created", "modified", etc.).`,
                        `4. Descreva a lógica e decisões técnicas adotadas no array "logic_changes".`,
                        `5. Preencha e salve obrigatoriamente o arquivo JSON formal de entrega na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não altere arquivos fora do escopo autorizado e dos recursos reservados.`,
                        `PROIBIDO: Não instale novas bibliotecas ou dependências sem necessidade comprovada.`,
                        `PROIBIDO: Não avance para etapas de verificação ou validação por conta própria.`
                    ]
                };

            case 'Verificar':
                return {
                    goal: `Auditar com rigor técnico o código implementado na tarefa '${task.title.trim()}', garantindo qualidade, conformidade, segurança e escalabilidade.`,
                    instructions: [
                        `1. Inspecione os arquivos alterados e verifique se cumprem todos os requisitos definidos.`,
                        `2. Realize auditoria estática de segurança (OWASP), tipagem estrita, tratamento defensivo de exceções e boas práticas.`,
                        `3. Audite a segurança e sanitização de inputs: valide como a aplicação trata dados recebidos de usuários, parâmetros de rotas, webhooks e arquivos externos (planilhas/payloads), prevenindo injeções de SQL/código, buffer overflows e falhas por dados nulos ou malformados.`,
                        `4. Avalie a escalabilidade e volumetria: analise o comportamento do código sob grandes massas de dados (uso de paginação, processamento em lotes/batching, tempo de resposta, consumo de memória/CPU, transações atômicas e prevenção de table locks).`,
                        `5. Execute os testes automatizados existentes no repositório e registre o resultado no array "tests" do JSON.`,
                        `6. Se encontrar qualquer falha, inconsistência, vulnerabilidade ou gargalo de escalabilidade, registre cada uma no array "errors" do JSON com título, descrição e passos de reprodução, recomendando a próxima etapa como "Corrigir".`,
                        `7. Se não houver nenhum erro ou problema, recomende a próxima etapa como "Validar".`,
                        `8. Preencha e salve obrigatoriamente o arquivo JSON formal de entrega na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não altere o código-fonte de produção nesta etapa (etapa estritamente de auditoria e testes).`,
                        `PROIBIDO: Não silencie inconformidades, vulnerabilidades de input ou gargalos de escalabilidade encontrados.`,
                        `PROIBIDO: Não declare testes como executados sem tê-los rodado de fato.`
                    ]
                };

            case 'Corrigir':
                return {
                    goal: `Corrigir exclusivamente as falhas e vulnerabilidades apontadas na verificação anterior para '${task.title.trim()}'.`,
                    instructions: [
                        `1. Consulte os erros reportados em gestao-ia/Tarefas.md e no histórico da entrega anterior.`,
                        `2. Corrija a causa raiz de cada problema identificado, aplicando o princípio da mudança mínima.`,
                        `3. Declare os arquivos corrigidos no array "files" do JSON.`,
                        `4. Descreva as correções efetuadas no array "logic_changes".`,
                        `5. Preencha e salve obrigatoriamente o arquivo JSON formal de entrega na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não adicione novas funcionalidades ou altere escopos que não foram reprovados.`,
                        `PROIBIDO: Não aplique refatorações cosméticas fora do escopo da correção.`,
                        `PROIBIDO: Não pule a reauditoria (a próxima etapa obrigatória após Corrigir é Verificar).`
                    ]
                };

            case 'Validar':
                return {
                    goal: `Executar testes de aceitação e preparar o parecer técnico de homologação para o aceite humano final de '${task.title.trim()}'.`,
                    instructions: [
                        `1. Execute testes completos de integração, regressão e validação dos critérios de aceitação.`,
                        `2. Registre todos os testes executados com seus status e comandos no array "tests" do JSON.`,
                        `3. Detalhe no campo "handoff_notes" o parecer para a homologação do usuário.`,
                        `4. Preencha e salve obrigatoriamente o arquivo JSON formal de entrega na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não conclua a tarefa (o rito exige que a conclusão seja homologada pelo usuário humano).`,
                        `PROIBIDO: Não afirme que testes passaram sem evidências executadas.`,
                        `PROIBIDO: Não altere regras de negócio na etapa de validação.`
                    ]
                };

            default:
                return {
                    goal: `Executar o escopo autorizado para a tarefa '${task.title.trim()}'.`,
                    instructions: [
                        `1. Execute o trabalho autorizado respeitando os recursos reservados.`,
                        `2. Registre as alterações no JSON formal de entrega.`,
                        `3. Salve o arquivo JSON na pasta gestao-ia/entrada/.`
                    ],
                    prohibitions: [
                        `PROIBIDO: Não altere arquivos fora do escopo autorizado.`
                    ]
                };
        }
    }
}

