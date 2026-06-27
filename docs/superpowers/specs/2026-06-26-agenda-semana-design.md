# Design: habilitar modo Semana na agenda

## Contexto

Tela de agenda em `apps/web/app/(authenticated)/schedule/page.tsx` já suporta `viewMode: "day" | "week"` no header, mas botão `Semana` está desabilitado. Hoje fluxo e componentes renderizam apenas visão diária por profissional, com busca de agendamentos em janela de 1 dia e sidebar com resumo diário.

Usuário quer habilitar opção `Semana` como grade semanal completa. Referência visual está em `docs/prints/`, mas primeira entrega deve preservar shell atual e tornar o modo semanal funcional dentro linguagem visual existente.

## Objetivo

Entregar modo `Semana` funcional na agenda autenticada, com:

- toggle real entre `Dia` e `Semana`
- navegação por semana
- grade semanal com 7 colunas
- cards de agendamento por dia/hora
- resumo lateral da semana

## Fora de escopo

- refazer shell/layout inteiro para copiar pixel a pixel print
- subcolunas por profissional dentro de cada dia na visão semanal
- criação por clique em slot vazio na grade semanal
- mudanças de contrato HTTP ou backend

## Abordagens consideradas

### 1. Reaproveitar grade atual e trocar eixo

Menos arquivos novos, mas força componente diário orientado a profissional a assumir dia + semana com muitos condicionais.

### 2. Criar grade semanal dedicada

Separa responsabilidades, reduz risco de regressão no modo dia, deixa fluxo semanal explícito.

**Escolha:** esta abordagem.

### 3. Renderizar 7 grades diárias lado a lado

Mais rápida no curto prazo, mas com duplicação de cabeçalhos e pior responsividade/scroll.

## Arquitetura proposta

### Estado da página

`SchedulePage` continua orquestrando queries e estado local, com inclusão de:

- `viewMode`, default `day`
- cálculo de intervalo conforme modo atual
- navegação contextual:
  - `day`: passo de 1 dia
  - `week`: passo de 7 dias

### Componentes

- `ScheduleHeader`
  - habilitar botão `Semana`
  - receber `onViewModeChange`
  - exibir heading por dia ou intervalo semanal

- `ScheduleGrid`
  - permanece como grade diária atual

- `ScheduleWeekGrid` novo
  - renderiza eixo vertical de horas
  - renderiza 7 colunas, uma por dia da semana
  - mostra cards consolidados por dia/hora
  - mostra linha de “agora” apenas no dia atual
  - mantém scroll horizontal no mobile

- `ScheduleSidebarSummary`
  - aceitar variante/título do resumo
  - aceitar lista agregada do período atual
  - no modo semana, exibir resumo semanal

## Modelo de dados

### Intervalo de busca

Modo `day`:

- `from = date`
- `to = date + 1`

Modo `week`:

- `from = início da semana`
- `to = início da próxima semana`

Semana começa na segunda-feira.

### Normalização

Adicionar utilitários para:

- obter início da semana a partir de `date`
- listar 7 datas da semana
- formatar heading semanal

Agendamentos da query semanal serão normalizados em:

- `appointmentsByDay`
- opcionalmente `appointmentsByDayAndProfessional` se simplificar cálculos internos

Na UI semanal, cada card mostrará:

- cliente
- serviço
- hora
- profissional

## Regras de layout e comportamento

### Grade semanal

- 7 colunas, uma por dia
- cabeçalho de coluna com nome curto do dia + data
- cards posicionados verticalmente por `startsAt/endsAt`
- limites verticais globais calculados sobre:
  - expediente da semana
  - agendamentos fora do expediente

### Expediente

Continuar usando `workingHoursQueries` por profissional. Para grade semanal:

- filtrar shifts por `weekday` de cada dia
- usar soma/unidade necessária apenas para cálculo de faixa útil e ocupação

### Linha de agora

- aparece só se dia atual estiver dentro semana exibida
- posicionada apenas na coluna do dia atual

### Sidebar semanal

Trocar conteúdo de “Resumo do dia” para “Resumo da semana”, mantendo estrutura atual:

- total de atendimentos
- ocupação
- faturamento estimado
- próximos 5 atendimentos futuros da semana

### Estado vazio

Se não houver agendamentos no período semanal:

- mostrar empty state específico: `Nenhum atendimento nesta semana`

## Responsividade

- modo dia continua como está
- modo semana usa `overflow-x-auto`
- colunas semanais precisam largura mínima para leitura dos cards
- sidebar pode permanecer à direita no desktop; em telas menores segue fluxo atual do shell

## Testes e validação

### Cobertura mínima

- utilitários de datas da semana
- cálculo de intervalo semanal
- heading semanal
- agregação para resumo semanal

### Verificações manuais

- alternar `Dia`/`Semana`
- navegar anterior/próxima semana
- botão `Hoje` reposiciona corretamente para dia atual/semana atual
- resumo semanal bate com cards visíveis
- linha de agora só aparece quando aplicável
- modo dia não regressa

## Riscos

- mistura excessiva de lógica `day/week` em `SchedulePage`
- ocupação semanal pode ficar inconsistente se total de janelas úteis não considerar expediente corretamente
- grade semanal pode ficar apertada em viewport pequena sem largura mínima adequada

## Critério de aceite

- usuário consegue clicar em `Semana`
- agenda carrega semana inteira sem quebrar modo `Dia`
- navegação semanal funciona
- sidebar mostra resumo semanal
- cards semanais mostram cliente, serviço, hora e profissional
- visual segue padrão atual, sem exigir redesign completo do shell
