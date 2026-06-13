# POST_MVP_PRODUCT_ROADMAP — Caminho futuro do produto após o MVP

> Documento vivo para orientar a evolução da plataforma de agendamento para salões e barbearias após a conclusão do MVP.
> Objetivo: manter o MVP enxuto, mas garantir que as decisões de produto e arquitetura tomadas agora permitam evolução aditiva rumo a uma solução mais próxima de referências como AppBarber e Booksy.
>
> Status: **v3 — sync ADR v4**. Complementar aos documentos-fonte do MVP; não substitui `PLANNING.md`, `API_CONTRACTS.md`, `DATABASE_SCHEMA_V2.md`, `ARCHITECTURE_DECISIONS.md` ou `IMPLEMENTATION_ROADMAP.md`.
> **Sync v4:** `min_schedule_notice_min` (§6.1) sai de "futuro" e passa a **constante no MVP** (default 15 — ADR-024); a entidade `organization_booking_settings` segue futura (vira config por empresa).

---

## Changelog v1 → v2

- **Monetização/SaaS billing ganhou fase própria e cedo no roadmap.** Planos, trial, assinatura, cobrança da barbearia e feature flags por plano não ficam mais soltos apenas como ADR futuro.
- **Escala técnica operacional subiu de fase final para fase inicial pós-MVP.** Redis, workers, fila/outbox genérica e zero-downtime passam a anteceder notificações automáticas e pagamentos, porque lembretes, webhooks e cobrança exigem processamento resiliente.
- **Notificações foram antecipadas em relação à conta global de cliente.** Lembretes atacam diretamente no-show e podem funcionar com cliente visitante usando dados do agendamento.
- **Mídia deixou de sugerir FK polimórfica (`owner_type`/`owner_id`).** O documento agora proíbe esse default e exige ADR para escolher entre FKs tipadas ou link tables por dono.
- **Removidas ambiguidades de fonte da verdade.** Política de cancelamento pertence a `booking_settings`; perfil público apenas exibe. `slot_interval_min` continua em `organizations` no MVP, sem duplicação automática. Perfil público de profissional deve preferir extensão de `professionals`, não tabela nova prematura.
- **Novos ADRs futuros registrados:** SSR/SEO das páginas públicas versus rate limit por IP real; outbox/fila genérica para notificações e webhooks; modelo de ownership de mídia; lista de espera; retenção/anonimização de staff; modelo conceitual de multiunidade.
- **Lista de espera e LGPD de staff ganharam casa no roadmap.** Não ficam mais apenas como itens “fora do MVP”.

---

## 1. Propósito deste documento

Este arquivo registra o caminho futuro do produto depois que o MVP estiver funcional e validado. Ele existe para evitar dois problemas comuns: transformar o MVP em um produto grande demais antes da hora e tomar decisões no MVP que bloqueiem funcionalidades importantes no futuro.

A plataforma deve nascer como um SaaS confiável de agenda para salões e barbearias, mas deve estar preparada para evoluir para um ecossistema mais completo: painel web, app para profissionais, app para clientes, assinatura SaaS, pagamentos, comunicação, retenção, relatórios, fidelidade, marketplace e operação multiunidade.

A regra central é: o MVP implementa apenas o necessário para agendamento confiável, mas a arquitetura não deve fechar portas para recursos futuros.

---

## 2. Estado-alvo do produto no longo prazo

O produto deve evoluir de uma agenda online confiável para uma plataforma operacional completa para beleza e barbearia.

No estado maduro, a plataforma deve permitir que uma empresa gerencie agenda, equipe, clientes, serviços, disponibilidade, planos pagos, pagamentos de clientes, comunicação, retenção, relatórios e presença pública em um único sistema. O cliente final deve conseguir encontrar o estabelecimento, escolher serviço, profissional, data, horário, confirmar presença, pagar quando aplicável, reagendar ou cancelar conforme política da empresa, avaliar o atendimento e manter histórico dos próprios agendamentos.

A referência de direção é competir progressivamente com plataformas como AppBarber e Booksy, mas sem tentar copiar tudo no MVP. O caminho correto é construir uma fundação forte primeiro e depois adicionar módulos de forma controlada.

---

## 3. Princípios de evolução pós-MVP

### 3.1 Evolução aditiva

Toda funcionalidade futura deve entrar sem exigir reescrita do núcleo de agendamento. O coração do sistema continua sendo `appointments`, disponibilidade, anti-conflito, idempotência, tenant isolation e real-time.

Quando uma feature exigir mudança na semântica de ocupação da agenda, ela deve ser tratada como decisão arquitetural, não como simples campo novo. Exemplo: buffers antes/depois de atendimento não são apenas colunas; eles mudam o intervalo ocupado para conflito e disponibilidade.

### 3.2 Agenda continua sendo a fonte de verdade operacional

Mesmo com pagamentos, marketplace, app cliente ou notificações, o agendamento confirmado continua sendo a unidade central do produto. Pagamento, mensagens, reviews e relatórios devem orbitar o agendamento, não substituir sua lógica.

### 3.3 Web primeiro, mobile depois, contrato único sempre

O MVP deve entregar web responsivo/PWA primeiro. O app mobile deve consumir os mesmos contratos e conceitos do backend, sem criar API paralela. O `packages/shared` deve continuar sendo a materialização do contrato entre web, api e mobile.

### 3.4 Real-time como invalidação, não como fonte de dados sensíveis

O WebSocket deve continuar emitindo eventos de invalidação sem PII. Nome, telefone, detalhes do cliente e histórico devem ser recuperados via HTTP autorizado. Essa regra vale também para app mobile.

### 3.5 Produto orientado a confiança

Para competir em agenda, a prioridade não é quantidade de telas; é confiança operacional. O sistema não pode duplicar horário, perder evento, vazar dados entre empresas, quebrar sessão sem motivo, perder webhook, duplicar lembrete, nem deixar o cliente sem retorno claro após confirmar um agendamento.

### 3.6 Receita não é detalhe técnico

Depois do MVP validado, monetização passa a ser parte estrutural do produto. Planos, trial, cobrança recorrente, limites por plano e feature flags devem nascer como arquitetura de SaaS, não como condicional espalhada no front.

---

## 4. Referências de mercado observadas

### 4.1 AppBarber

Referência principal no Brasil para barbearias. Pontos observados como direção futura:

- agenda online via WebAdmin e aplicativo;
- app para profissionais;
- site do estabelecimento com informações públicas, serviços, profissionais, localização, imagens e formas de pagamento;
- caixa/financeiro;
- gestão de pacotes;
- estoque;
- programa de fidelidade;
- pesquisa de satisfação;
- lista de espera;
- mensagens automáticas de retorno.

Fontes para revisão manual futura:

- https://appbarber.com.br/
- https://appbarber.com.br/funcionalidades/
- App Store — AppBarber PRO: Profissionais

### 4.2 Booksy

Referência internacional de plataforma completa para beleza e bem-estar. Pontos observados como direção futura:

- booking online 24/7;
- app para empresas/profissionais;
- app para clientes;
- marketplace e descoberta de prestadores;
- comparação de preço e avaliações;
- calendário, clientes, checkout e marketing;
- pagamentos online;
- proteção contra no-show por depósito ou taxa de cancelamento;
- relatórios de vendas, transações, tendências e previsão de receita;
- client management com tags/grupos de clientes;
- promoções, reviews, portfólio e comunicação com clientes.

Fontes para revisão manual futura:

- https://biz.booksy.com/en-us
- https://biz.booksy.com/en-us/features
- https://biz.booksy.com/en-us/features/no-show-protection
- https://biz.booksy.com/en-gb/features/client-management
- App Store — Booksy Biz: For Businesses
- Google Play — Booksy for Customers

---

## 5. O que NÃO deve entrar no MVP, mas precisa guiar o desenho

Os itens abaixo não devem ser implementados antes do MVP estar finalizado, salvo se uma decisão futura alterar explicitamente o escopo. Eles devem, porém, orientar nomes, contratos, entidades e pontos de extensão.

- app mobile completo para iOS/Android;
- login do cliente final;
- remarcação pelo cliente;
- pagamentos online;
- depósitos, taxas de cancelamento e proteção contra no-show;
- marketplace e descoberta por localização;
- avaliações públicas;
- portfólio de fotos;
- notificações automáticas por WhatsApp/SMS/e-mail;
- estoque;
- caixa/PDV;
- comissões;
- pacotes, planos e assinaturas do cliente final;
- programa de fidelidade;
- lista de espera;
- multiunidade;
- relatórios avançados;
- campanhas de marketing;
- aprovação manual de agendamento;
- recursos avançados de CRM;
- billing SaaS completo antes da validação do MVP.

Esses itens devem ser tratados como evolução pós-MVP, não como falha do MVP.

---

## 6. Lacunas que devem ser documentadas antes ou logo após o MVP

### 6.1 Configurações de política de agendamento

O MVP já define regras como horizonte máximo, **antecedência mínima de agendamento (`min_schedule_notice_min` = 15 — ADR-024)**, cancelamento via token até o início do horário e confirmação direta do agendamento. Essas regras hoje são **constantes declaradas no `shared`** (default global, revisável). No futuro, precisam ser configuráveis **por empresa**.

Recomendação futura: criar `organization_booking_settings` ou entidade equivalente.

Campos candidatos:

- `booking_horizon_days` *(MVP: constante, default 90)*;
- `min_schedule_notice_min` *(MVP: constante, default 15 — ADR-024)*;
- `min_cancel_notice_min`;
- `public_booking_enabled`;
- `public_cancel_enabled`;
- `auto_confirm_public_bookings`;
- `allow_client_reschedule`;
- `require_client_account`;
- `require_deposit`;
- `no_show_policy_enabled`;
- `cancellation_fee_policy`;
- `reminder_policy`.

Regra: não implementar tudo no MVP, mas evitar hardcode que impeça configuração futura.

Regra de fonte da verdade: política de cancelamento pertence a `booking_settings`; o perfil público apenas exibe texto derivado ou configurado para apresentação. Não duplicar a política em `organization_public_profile`. `slot_interval_min` já existe em `organizations` no MVP; só deve migrar ou ser referenciado por settings mediante ADR específico.

### 6.2 Perfil público do estabelecimento

O MVP possui página pública de agendamento, mas a evolução natural exige página pública mais completa.

Recomendação futura: criar `organization_public_profile` ou extensão equivalente.

Campos candidatos:

- descrição pública;
- endereço textual;
- cidade, estado e bairro;
- coordenadas geográficas futuras;
- telefone comercial;
- WhatsApp comercial;
- Instagram;
- imagem de capa;
- logo;
- galeria de imagens;
- formas de pagamento aceitas;
- instruções ao cliente;
- texto público de política de cancelamento, derivado ou sincronizado da política real;
- status de publicação.

Objetivo: transformar o link público em uma vitrine, não apenas em formulário de agendamento.

### 6.3 Perfil público do profissional

A evolução competitiva exige que o profissional tenha página pública própria dentro da empresa.

Recomendação futura: preferir extensão de `professionals` para campos simples. Só criar `professional_public_profile` se houver necessidade real de separar ciclo de publicação, auditoria editorial ou dados volumosos.

Campos candidatos:

- foto;
- bio curta;
- especialidades;
- anos de experiência;
- ordem de exibição;
- redes sociais opcionais;
- status de visibilidade pública;
- galeria/portfólio futuro.

Regra: evitar tabela nova prematura se colunas simples em `professionals` resolverem. O critério é ciclo de vida, não organização estética do banco.

### 6.4 Estratégia de mídia e arquivos

Fotos de estabelecimento, profissionais, portfólio e comprovantes não devem ser salvos no banco nem no filesystem local da aplicação.

Recomendação futura: usar object storage e tabela de metadados.

Entidade candidata: `media_assets`, mas **sem FK polimórfica**. Não usar `owner_type` + `owner_id` como default, porque isso quebra integridade referencial e contradiz a disciplina tenant-safe do projeto.

Modelo a decidir por ADR:

- opção A: `media_assets` com `organization_id` e FKs tipadas nullable, com `CHECK` garantindo exatamente um dono quando aplicável;
- opção B: `media_assets` como objeto puro de arquivo + link tables por dono, por exemplo `organization_media_assets`, `professional_media_assets`, `service_media_assets`, `review_media_assets`;
- opção C: modelo híbrido, com link tables para domínios públicos e anexos específicos para domínios privados.

Campos candidatos em `media_assets`:

- `id`;
- `organization_id`;
- `kind`;
- `storage_key`;
- `mime_type`;
- `size_bytes`;
- `width`;
- `height`;
- `status`;
- `created_by`;
- `created_at`.

Regras futuras:

- imagens públicas devem ter variantes otimizadas;
- uploads devem validar tamanho, tipo e conteúdo;
- URLs públicas devem ser derivadas de storage/CDN, não de paths locais da API;
- remoção de imagem deve ser auditável quando impactar perfil público;
- todo vínculo com dono deve manter integridade referencial real.

### 6.5 Identidade futura do cliente final

No MVP, o cliente é tenant-scoped em `clients`: cada empresa tem sua base de clientes. Isso é correto para agenda sem login.

No futuro, com app do cliente, será necessário conectar vários registros `clients` a uma identidade global do consumidor.

Recomendação futura: criar `customer_accounts` e uma tabela de vínculo.

Entidades candidatas:

- `customer_accounts` — identidade global do cliente final;
- `client_identity_links` — vínculo entre `clients` tenant-scoped e `customer_accounts`.

Regra: não substituir `clients`. A base por empresa continua existindo, porque o estabelecimento precisa manter relacionamento próprio com aquele cliente.

### 6.6 Fluxo pós-agendamento público

No MVP, sem WhatsApp automático, o cliente precisa receber uma confirmação útil imediatamente.

Recomendação de UX para o MVP ou pós-MVP imediato:

- tela de confirmação com dados do agendamento;
- botão para copiar link de cancelamento;
- botão para abrir WhatsApp com mensagem pronta para si mesmo ou para o estabelecimento;
- botão para adicionar ao calendário;
- aviso claro da política de cancelamento;
- fallback caso real-time ou rede falhe.

Esse fluxo é pequeno, mas tem impacto direto na confiança do cliente.

### 6.7 Monetização e planos SaaS

Um SaaS de agenda precisa definir como a empresa paga pelo produto. Isso não deve contaminar o MVP, mas não pode ficar invisível no roadmap.

Entidades candidatas:

- `plans`;
- `subscriptions`;
- `subscription_items` ou limites por plano;
- `billing_accounts`;
- `invoices`;
- `billing_events`;
- `entitlements` ou `plan_features`.

Decisões futuras:

- trial grátis ou plano free limitado;
- cobrança mensal/anual;
- limite por profissionais, agendamentos, unidades ou recursos;
- feature flags por plano;
- bloqueio suave por inadimplência;
- grace period;
- integração com gateway fiscal/financeiro.

Regra: controle de plano não deve virar `if (plan === ...)` espalhado no front. Precisa de camada central de entitlement.

### 6.8 Lista de espera

Lista de espera aparece como recurso comum em plataformas de agenda, mas não tem casa no MVP.

Casa natural: junto de configurações avançadas de agenda, disponibilidade e notificações.

Entidades candidatas:

- `waitlist_entries`;
- preferências de profissional, serviço, dia e faixa de horário;
- prioridade;
- status;
- expiração;
- origem;
- histórico de contato.

Regra: lista de espera não reserva horário. Ela reage a cancelamentos/disponibilidade e pode disparar comunicação, mas a reserva continua passando pelo fluxo normal de agendamento.

### 6.9 Retenção, anonimização e LGPD de staff

O MVP registra a anonimização de clientes e o scrub de texto livre relacionado a clientes. A anonimização/encerramento de conta de usuários internos (`users`/staff) fica como limitação documentada, mas precisa ganhar fase concreta.

Decisões futuras:

- encerramento de conta de membro;
- anonimização de nome/e-mail/telefone de staff sem quebrar auditoria;
- retenção mínima de eventos de segurança;
- diferença entre desativar acesso e exercer direito ao esquecimento;
- tratamento de `actor_user_id` em trilhas históricas;
- exportação de dados.

Regra: histórico operacional não deve ser apagado de forma destrutiva. A decisão deve preservar auditoria e reduzir PII.

### 6.10 SEO/SSR das páginas públicas versus rate limit por IP real

O MVP decide que fetch de availability/booking público é client-side para que o IP usado no rate limit seja o IP real do visitante. Quando a página pública evoluir para SEO forte e páginas indexáveis, pode haver pressão para SSR/SSG.

Esse trade-off exige ADR antes de implementação.

Pontos a decidir:

- quais dados públicos podem ser renderizados no servidor;
- quais dados continuam client-side por rate limit e frescor;
- como propagar IP real quando houver SSR;
- separação entre página vitrine indexável e endpoint de disponibilidade quente;
- cache público sem vazar disponibilidade sensível.

### 6.11 Outbox/fila genérica

O MVP usa `appointment_events` como trilha de domínio e outbox para real-time. Notificações, webhooks de pagamento, e-mails e jobs pós-agendamento exigem uma fila/outbox mais genérica.

Decisão futura: promover para uma arquitetura de filas/eventos genérica antes de notificações e pagamentos.

Entidades candidatas:

- `outbox_events`;
- `job_runs`;
- `notification_jobs`;
- `webhook_events`;
- `delivery_attempts`.

Regra: notificações e webhooks devem ser at-least-once, idempotentes, com retry/backoff e dead-letter. Não devem depender de request HTTP síncrono nem de processo único.

### 6.12 Modelo conceitual de multiunidade

Construir multiunidade fica para fase futura, mas o conceito precisa ser decidido antes de features que expõem perfil público, planos, permissões e relatórios avançados.

Decisão futura: unidade é filha de `organization`, ou `organization` já representa a unidade e um grupo fica acima dela?

Essa decisão impacta:

- perfil público;
- permissões;
- planos SaaS;
- agenda;
- relatórios;
- marketplace;
- profissionais compartilhados;
- cobrança por unidade.

Regra: não implementar multiunidade no MVP, mas decidir o modelo conceitual antes de P1/P2 avançarem demais se redes forem público-alvo próximo.

---

## 7. Roadmap pós-MVP recomendado

### Fase P1 — Produto público e conversão

Objetivo: transformar a página pública em uma vitrine confiável, melhorando aquisição de clientes sem virar marketplace.

Escopo recomendado:

- perfil público da empresa;
- perfil público do profissional;
- informações de localização e contato;
- fotos básicas com storage correto;
- formas de pagamento aceitas;
- exibição da política pública de cancelamento;
- SEO básico para páginas públicas, respeitando o ADR futuro de SSR/rate limit;
- melhoria da tela de confirmação;
- adicionar ao calendário;
- link manual de WhatsApp mais bem acabado.

Critério de aceite:

- um estabelecimento consegue compartilhar um link público que passa confiança;
- cliente consegue entender quem atende, onde atende, quais serviços existem e como cancelar;
- o booking continua simples e rápido;
- nenhum dado sensível trafega por URL;
- mídia pública não usa FK polimórfica nem filesystem local da API.

### Fase P2 — Configurações avançadas de agenda e lista de espera

Objetivo: permitir que cada empresa modele sua operação real sem alterar código.

Escopo recomendado:

- `organization_booking_settings`;
- antecedência mínima para agendar;
- antecedência mínima para cancelar;
- horizonte configurável de agenda;
- dias fechados especiais;
- políticas por serviço/profissional;
- buffers antes/depois de serviços;
- duração/preço por profissional em `professional_services`;
- ordenação pública de serviços e profissionais;
- availability “qualquer profissional”;
- lista de espera;
- regras de notificação quando um horário volta a ficar livre.

Observação crítica: buffers exigem decisão de arquitetura, porque alteram o intervalo ocupado para conflito e disponibilidade. Lista de espera não reserva horário; ela só cria oportunidade de contato/agendamento.

Critério de aceite:

- regras configuráveis não quebram o anti-conflito;
- a disponibilidade pública e do painel continuam coerentes;
- o POST continua sendo a fonte de verdade contra corrida;
- lista de espera não cria reserva invisível nem duplica disputa de slot.

### Fase P3 — Monetização SaaS, planos e billing

Objetivo: permitir que a plataforma cobre das empresas de forma controlada e escalável.

Escopo recomendado:

- planos comerciais;
- trial;
- assinatura mensal/anual;
- status de assinatura;
- entitlements por plano;
- feature flags por plano;
- limites por número de profissionais, unidades, recursos ou volume;
- grace period;
- bloqueio suave por inadimplência;
- página de gestão de plano;
- eventos de billing auditáveis.

Entidades candidatas:

- `plans`;
- `subscriptions`;
- `billing_accounts`;
- `billing_events`;
- `entitlements` ou `plan_features`.

Critério de aceite:

- uma empresa consegue iniciar trial, escolher plano e ter recursos liberados por entitlement;
- inadimplência não corrompe dados nem apaga agenda;
- bloqueio de recurso é centralizado, não espalhado em condicionais de UI;
- billing não interfere na integridade do agendamento.

### Fase P4 — Escala técnica operacional: Redis, workers, filas e zero-downtime

Objetivo: remover a fragilidade operacional do single-instance antes de rodar notificações e pagamentos em produção real.

Escopo recomendado:

- Redis para rate limit distribuído;
- Redis pub/sub ou adapter do Socket.IO;
- cache controlado onde fizer sentido;
- deploy zero-downtime real;
- múltiplas instâncias da API;
- workers separados para relay/jobs;
- outbox/fila genérica;
- dead-letter operacional;
- métricas e tracing mais completos;
- revisão de health/readiness para API e workers.

Critério de aceite:

- evento publicado em uma instância chega ao socket conectado em outra;
- rate limit não é contornável entre instâncias;
- worker não processa evento duplicado indevidamente;
- deploy não derruba webhooks, jobs ou sessões ativas sem necessidade;
- fila/eventos suportam retry/backoff e dead-letter.

### Fase P5 — Notificações automáticas e comunicação

Objetivo: reduzir no-show e aumentar retenção sem depender de contato manual.

Escopo recomendado:

- lembrete por e-mail;
- lembrete por SMS/WhatsApp, se houver provedor aprovado;
- templates por empresa;
- preferências de comunicação do cliente;
- opt-in/opt-out;
- fila de envio;
- status de entrega;
- retry/backoff;
- logs de comunicação sem PII excessiva;
- mensagem de retorno pós-atendimento;
- integração com lista de espera quando um horário abre.

Critério de aceite:

- falha do provedor não quebra agendamento;
- envio é rastreável;
- cliente não recebe mensagens duplicadas em retry;
- consentimento é respeitado;
- lembrete pode operar com cliente visitante, sem exigir conta global.

### Fase P6 — Pagamentos e proteção contra no-show

Objetivo: permitir cobrança online e reduzir prejuízo por faltas/cancelamentos tardios.

Escopo recomendado:

- integração com gateway de pagamento;
- depósitos por serviço;
- taxa de cancelamento;
- cartão salvo via provedor, nunca no banco próprio;
- checkout;
- reembolso;
- webhooks de pagamento;
- conciliação básica;
- status financeiro por agendamento;
- política por empresa/serviço;
- ligação com entitlements/plano quando aplicável.

Entidades candidatas:

- `payment_accounts`;
- `payment_intents`;
- `appointment_payments`;
- `refunds`;
- `payment_webhook_events`.

Critério de aceite:

- webhook é idempotente;
- pagamento não confirma horário se o agendamento falhar;
- agendamento não duplica se o pagamento repetir callback;
- nenhum dado de cartão é armazenado localmente;
- falha do gateway não trava a agenda inteira.

### Fase P7 — Cliente final e app futuro

Objetivo: preparar o caminho para app iOS/Android do cliente sem quebrar a base tenant-scoped.

Escopo recomendado:

- conta global de cliente;
- vínculo entre conta global e clientes por empresa;
- histórico de agendamentos do cliente;
- cancelamento autenticado;
- remarcação pelo cliente conforme política da empresa;
- favoritos;
- consentimentos e preferências de comunicação;
- push notifications futuras;
- secure storage para refresh no mobile;
- contratos mobile importando `packages/shared`.

Critério de aceite:

- cliente consegue ver seus próprios agendamentos em várias empresas;
- empresa continua dona do relacionamento local com o cliente;
- LGPD continua preservada por tenant e por identidade global;
- app não cria contrato paralelo ao backend.

### Fase P8 — Retenção, privacidade e LGPD ampliada

Objetivo: formalizar governança de dados além do cliente visitante.

Escopo recomendado:

- anonimização/encerramento de conta de staff;
- exportação de dados;
- retenção configurável quando aplicável;
- política de logs e trilhas históricas;
- tratamento de `actor_user_id` em auditoria;
- revisão de campos livres adicionados após o MVP;
- rotina de scrub para novas entidades com PII;
- painel mínimo de solicitações de privacidade.

Critério de aceite:

- direito ao esquecimento de cliente e staff tem caminho documentado;
- auditoria operacional continua íntegra;
- PII é reduzida sem apagar histórico de negócio de forma destrutiva;
- campos livres têm regra clara de scrub.

### Fase P9 — Clientes, CRM e retenção comercial

Objetivo: transformar a base de clientes em ferramenta de relacionamento.

Escopo recomendado:

- client cards;
- tags;
- notas internas;
- preferências;
- restrições/alertas;
- histórico detalhado;
- clientes fiéis;
- clientes inativos;
- aniversários;
- campanhas simples;
- programa de fidelidade;
- pacotes e assinaturas do cliente final;
- bloqueio de cliente problemático.

Observação LGPD: todo texto livre capaz de conter PII deve entrar na política de scrub/anonymize.

Critério de aceite:

- PROFESSIONAL só vê clientes da própria agenda quando aplicável;
- OWNER/MANAGER têm visão operacional;
- anonimização continua limpando campos livres relevantes;
- campanhas respeitam consentimento.

### Fase P10 — Operação financeira, caixa e relatórios

Objetivo: evoluir de agenda para gestão operacional do negócio.

Escopo recomendado:

- caixa diário;
- formas de pagamento;
- registro de recebimentos;
- comissões por profissional;
- fechamento de caixa;
- relatórios de faturamento;
- ticket médio;
- serviços mais vendidos;
- clientes atendidos;
- taxa de no-show;
- ocupação da agenda;
- previsões simples.

Critério de aceite:

- relatório não altera dado operacional;
- métricas são derivadas de eventos/agendamentos estáveis;
- filtros por período, profissional e serviço são consistentes;
- financeiro interno não se confunde com billing SaaS da plataforma.

### Fase P11 — Estoque, pacotes e fidelidade

Objetivo: cobrir funcionalidades comuns de barbearias maduras.

Escopo recomendado:

- cadastro de produtos;
- movimentações de estoque;
- baixa manual ou por atendimento futuro;
- pacotes de serviços;
- créditos de cliente;
- programa de fidelidade;
- validade de pacotes;
- auditoria de consumo.

Critério de aceite:

- estoque não se mistura com agenda;
- consumo de pacote é transacional;
- estorno é auditável;
- fidelidade não burla pagamento/atendimento concluído.

### Fase P12 — Avaliações, reputação e portfólio

Objetivo: aumentar confiança pública e preparar base para marketplace.

Escopo recomendado:

- avaliação pós-atendimento;
- nota pública;
- comentário moderado;
- resposta do estabelecimento;
- portfólio de fotos;
- destaque de serviços/profissionais;
- denúncia/moderação.

Critério de aceite:

- somente cliente com atendimento concluído pode avaliar;
- review pode ser moderado sem apagar trilha;
- reputação não vaza PII;
- mídia segue o modelo aprovado por ADR.

### Fase P13 — Marketplace e descoberta

Objetivo: permitir que clientes encontrem estabelecimentos dentro da plataforma, não apenas por link direto.

Escopo recomendado:

- busca por cidade/bairro/localização;
- filtro por serviço;
- filtro por disponibilidade;
- filtro por preço;
- avaliações;
- favoritos;
- destaque patrocinado futuro;
- páginas indexáveis;
- ranking com critérios transparentes;
- antifraude de reviews.

Critério de aceite:

- marketplace não quebra isolamento multi-tenant;
- dados públicos são explicitamente publicados;
- empresa pode controlar visibilidade;
- busca não expõe agenda interna além dos slots públicos;
- ranking tem regra documentada e auditável.

### Fase P14 — Multiunidade e escala operacional de redes

Objetivo: atender redes com mais de uma unidade.

Escopo recomendado:

- unidades/branches por organização, ou modelo alternativo decidido por ADR;
- profissionais alocados por unidade;
- serviços por unidade;
- agenda por unidade;
- relatórios consolidados;
- permissões por unidade;
- página pública por unidade;
- cobrança por unidade, se aplicável;
- migração cuidadosa do conceito atual “uma empresa = uma unidade”.

Observação crítica: multiunidade pode exigir mudança relevante no modelo de tenant. Deve ser tratada por ADR antes de qualquer implementação. O ideal é decidir o modelo conceitual cedo, mesmo que a construção fique para esta fase.

Critério de aceite:

- uma organização consegue operar várias unidades sem vazar agenda entre elas;
- OWNER pode ver consolidado;
- MANAGER pode ter escopo por unidade;
- profissional pode atuar em uma ou mais unidades;
- billing e permissões continuam coerentes.

---

## 8. Sequência macro recomendada

Após finalizar o MVP, a ordem recomendada é:

1. Produto público e conversão;
2. Configurações avançadas de agenda e lista de espera;
3. Monetização SaaS, planos e billing;
4. Escala técnica operacional: Redis, workers, filas e zero-downtime;
5. Notificações automáticas e comunicação;
6. Pagamentos e proteção contra no-show;
7. Cliente final e app futuro;
8. Retenção, privacidade e LGPD ampliada;
9. Clientes, CRM e retenção comercial;
10. Operação financeira, caixa e relatórios;
11. Estoque, pacotes e fidelidade;
12. Avaliações, reputação e portfólio;
13. Marketplace e descoberta;
14. Multiunidade e escala operacional de redes.

Essa ordem evita começar pelo marketplace ou app completo antes de resolver o essencial: agenda confiável, página pública forte, política configurável, receita SaaS, infraestrutura operacional para workers/webhooks, comunicação e pagamentos.

---

## 9. Decisões futuras que exigem ADR próprio

As decisões abaixo não devem entrar como simples PR técnico. Precisam de ADR antes de implementação:

- app mobile: Expo/React Native vs nativo;
- identidade global do cliente;
- modelo conceitual de multiunidade: unidade filha de `organization` ou camada superior agrupadora;
- pagamentos de clientes e gateway oficial;
- billing SaaS: planos, trial, cobrança, grace period e feature flags por plano;
- camada de entitlements e limites por plano;
- WhatsApp/SMS provider;
- marketplace e critérios de ranking;
- reviews e moderação;
- buffers e ocupação real da agenda;
- Redis/multi-instância;
- workers separados e zero-downtime operacional;
- outbox/fila genérica para notificações, webhooks e jobs;
- armazenamento de mídia e ownership sem FK polimórfica;
- SSR/SEO das páginas públicas versus fetch público client-side e rate limit por IP real;
- política de retenção/anonymize para usuários staff;
- lista de espera e regra de priorização;
- cache público de páginas/vitrine sem vazar disponibilidade sensível.

---

## 10. Guardrails para não contaminar o MVP

O MVP não deve receber tabelas, rotas ou telas futuras apenas “para deixar preparado”, se elas não forem usadas. Preparar o futuro significa:

- nomes corretos;
- contratos estáveis;
- pontos de extensão;
- decisões registradas;
- restrições documentadas;
- arquitetura que aceite evolução aditiva.

Não significa implementar marketplace, pagamentos, app mobile, CRM, billing completo ou multiunidade antes da agenda estar sólida.

Guardrails específicos:

- não criar FK polimórfica `owner_type`/`owner_id` para mídia;
- não duplicar política de cancelamento entre settings e perfil público;
- não duplicar `slot_interval_min` sem ADR;
- não criar tabela de perfil profissional se extensão de `professionals` resolver;
- não colocar billing/entitlements como condicionais soltas no front;
- não iniciar pagamentos ou notificações automáticas sem workers/fila/outbox adequados;
- não transformar lista de espera em reserva invisível;
- não promover SEO/SSR de disponibilidade sem resolver rate limit por IP real;
- não decidir multiunidade tarde demais se o público-alvo passar a incluir redes.

---

## 11. Checklist de atualização deste documento

Atualizar este arquivo sempre que:

- uma feature sair do “futuro” e virar escopo real;
- uma decisão exigir ADR;
- uma referência de mercado relevante for analisada;
- uma limitação do MVP for descoberta;
- uma funcionalidade futura exigir alteração no schema atual;
- uma fase pós-MVP for promovida para roadmap executável;
- uma decisão de monetização alterar limites, planos ou arquitetura de entitlement.

Antes de iniciar qualquer fase pós-MVP, criar um roadmap específico no mesmo estilo do `IMPLEMENTATION_ROADMAP.md`, com PRs pequenos, dependências e critérios de aceite.

---

## 12. Relação com os documentos centrais

Este documento é complementar.

Fonte de verdade atual:

- `PLANNING.md` — visão do MVP, escopo e fases atuais;
- `API_CONTRACTS.md` — contrato HTTP do MVP;
- `DATABASE_SCHEMA_V2.md` — schema SQL canônico;
- `ARCHITECTURE_DECISIONS.md` — decisões arquiteturais aceitas;
- `IMPLEMENTATION_ROADMAP.md` — sequência executável do MVP.

Este arquivo não altera o MVP automaticamente. Quando uma decisão futura for aprovada, ela deve ser promovida para ADR e espelhada nos documentos centrais correspondentes.

---

## 13. Conclusão

A decisão correta é finalizar primeiro um MVP excelente de agenda confiável, com real-time, anti-conflito forte, multi-tenant seguro, UX pública simples e painel operacional estável.

Depois disso, o produto deve evoluir em direção a uma plataforma completa, aproximando-se de referências como AppBarber e Booksy por fases: vitrine pública, políticas de agenda, monetização SaaS, infraestrutura operacional para escala, notificações, pagamentos, app do cliente, governança de dados, CRM, relatórios, fidelidade, avaliações, marketplace e multiunidade.

O objetivo não é copiar concorrentes tela por tela. O objetivo é construir uma base tecnicamente superior e evoluir com segurança, mantendo cada funcionalidade futura como adição planejada, não como refatoração emergencial.
