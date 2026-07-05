# Nexos Booking — Especificação de Design (Dark / Light)

> Guia de handoff para o código. Extraído dos conceitos de UI (Agenda + Login).
> Stack alvo: **Next.js + Tailwind CSS + shadcn/ui**. Tema **escuro como padrão**, claro alternável via classe `.light` na raiz.
> Acento da marca: **ciano** (`#22d3ee` → `#0891b2`). Fonte: **Plus Jakarta Sans**.

---

## 1. Fonte

```
Família:  'Plus Jakarta Sans', system-ui, sans-serif
Pesos:    400 (texto), 500/600 (apoio), 700 (títulos/labels), 800 (headlines, números)
```

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

### Escala tipográfica
| Uso | Tamanho | Peso | Tracking |
|---|---|---|---|
| Headline (login hero) | 34px | 800 | -0.02em |
| Título de página / número grande | 21–24px | 800 | -0.01em |
| Título de seção / card | 13–15px | 700/800 | -0.01em |
| Corpo | 13–14px | 400/500 | — |
| Label de campo | 12px | 600 | — |
| Small / meta | 11–12px | 600 | — |
| Micro (horário no bloco) | 9.5–10.5px | 600/700 | — |
| Label de seção (sidebar) | 10–11px | 700 | 0.13em (UPPERCASE) |

---

## 2. Tokens de cor

A referência (NEXOS ERP) é **dark-first**. O tema claro espelha cada token. Use variáveis CSS — assim o modo black/white é só uma classe na raiz.

### `globals.css` — pronto pra colar

```css
:root {
  /* ===== TEMA ESCURO (padrão) ===== */
  --bg:            #0a0f1a;  /* fundo da aplicação            */
  --surface:       #0c1119;  /* sidebar / superfícies         */
  --surface-2:     #0b1019;  /* topbar / painel lateral       */
  --card:          #11192a;  /* cards, stats                  */
  --card-2:        #0d1422;  /* cards elevados (modais/login) */
  --input:         #0e1626;  /* fundo de campos               */
  --border:        #19212f;  /* bordas / divisores            */
  --border-strong: #1c2740;  /* bordas de controles           */
  --grid-line:     #141b29;  /* linhas de hora na agenda      */

  --text:          #e6edf6;  /* texto principal               */
  --text-muted:    #8493a6;  /* texto secundário              */
  --text-faint:    #5b6677;  /* labels / placeholders         */

  --accent:        #22d3ee;  /* acento (ciano)                */
  --accent-deep:   #0891b2;  /* acento profundo / gradiente   */
  --accent-text:   #67e8f9;  /* texto/ícone de acento no dark */
  --accent-soft:   rgba(34,211,238,.12); /* fundo ativo/badge */
  --on-accent:     #04222a;  /* texto sobre botão de acento   */

  --radius-frame: 3px;
  --radius-card:  14px;
  --radius-ctrl:  10px;
  --radius-pill:  9px;
}

.light {
  /* ===== TEMA CLARO ===== */
  --bg:            #f6f8fb;
  --surface:       #ffffff;
  --surface-2:     #ffffff;
  --card:          #f6f8fb;
  --card-2:        #ffffff;
  --input:         #f7f9fc;
  --border:        #e7ebf1;
  --border-strong: #e0e6ee;
  --grid-line:     #eef1f6;

  --text:          #0f1b2d;
  --text-muted:    #5a6678;
  --text-faint:    #94a0b3;

  --accent:        #0891b2;
  --accent-deep:   #0e7490;
  --accent-text:   #0e7490;
  --accent-soft:   #e3f7fb;
  --on-accent:     #ffffff;
}

body { background: var(--bg); color: var(--text); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
```

> O gradiente do acento (botões / logo) é sempre `linear-gradient(145deg, #22d3ee, #0891b2)`.
> No dark, texto do botão = `var(--on-accent)` (#04222a); no light = branco.

### `tailwind.config.ts` — extend

```ts
export default {
  darkMode: ['class'], // use a classe .light para inverter, ou inverta a lógica
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)',
        card: 'var(--card)', 'card-2': 'var(--card-2)', input: 'var(--input)',
        border: 'var(--border)', 'border-strong': 'var(--border-strong)',
        'grid-line': 'var(--grid-line)',
        text: 'var(--text)', 'text-muted': 'var(--text-muted)', 'text-faint': 'var(--text-faint)',
        accent: 'var(--accent)', 'accent-deep': 'var(--accent-deep)',
        'accent-text': 'var(--accent-text)', 'accent-soft': 'var(--accent-soft)',
      },
      borderRadius: { frame: '3px', card: '14px', ctrl: '10px', pill: '9px' },
      fontFamily: { sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'] },
    },
  },
}
```

---

## 3. Paleta de status de agendamento

Cada tipo de serviço tem um tom. Cor por **tom**, não por serviço, pra ficar fácil mapear no futuro.
Coloque isso no `packages/shared` (vale para o front desabilitar/colorir com o mesmo dado).

```ts
// shared/appointment-tones.ts
export type ApptTone = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';

export const APPT_TONES = {
  dark: {
    cyan:    { bg: 'rgba(34,211,238,.13)', bar: '#22d3ee', fg: '#7fe9f7' },
    violet:  { bg: 'rgba(139,92,246,.16)', bar: '#a78bfa', fg: '#c4b5fd' },
    emerald: { bg: 'rgba(52,211,153,.14)', bar: '#34d399', fg: '#6ee7b7' },
    amber:   { bg: 'rgba(245,158,11,.15)', bar: '#fbbf24', fg: '#fcd34d' },
    rose:    { bg: 'rgba(251,113,133,.15)', bar: '#fb7185', fg: '#fda4af' },
  },
  light: {
    cyan:    { bg: '#e3f7fb', bar: '#0891b2', fg: '#0e7490' },
    violet:  { bg: '#efeaff', bar: '#7c3aed', fg: '#6d28d9' },
    emerald: { bg: '#e4f7ee', bar: '#059669', fg: '#047857' },
    amber:   { bg: '#fcf1df', bar: '#d97706', fg: '#b45309' },
    rose:    { bg: '#ffecef', bar: '#e11d48', fg: '#be123c' },
  },
} as const;

// sugestão de mapeamento (ajuste por serviço cadastrado)
export const TONE_BY_KIND: Record<string, ApptTone> = {
  corte: 'cyan', combo: 'cyan', barba: 'amber',
  coloracao: 'violet', escova: 'emerald', hidratacao: 'rose',
};
```

Texto secundário dentro do bloco: cliente `#c3cdda` (dark) / `#33415a` (light); horário `#8694a6` (dark) / `#7c8a9c` (light).

---

## 4. Receitas de componentes

Medidas reais usadas nos mockups.

### Layout do painel
| Elemento | Valor |
|---|---|
| Sidebar completa | largura **240–248px**, fundo `--surface`, borda direita `--border` |
| Rail de ícones (compacto) | largura **68px**, itens 42×42, raio 11px |
| Topbar | altura **58–62px**, fundo `--surface-2`, borda inferior `--border` |
| Painel lateral direito (resumo) | largura **298px** |
| Padding do conteúdo | 14–22px |

### Item de navegação
```
inativo:  padding 9px 10px · radius 9px · cor var(--text-muted) · ícone 18px · peso 600
ativo:    fundo var(--accent-soft) · cor var(--accent-text) · peso 700
          + barra de 2px à esquerda: box-shadow: inset 2px 0 0 var(--accent)
```

### Botão primário (acento)
```
background: linear-gradient(145deg, #22d3ee, #0891b2)
color: var(--on-accent) · padding 8–13px 15px · radius var(--radius-pill/ctrl) · peso 700
box-shadow: 0 6–8px 16–20px rgba(8,145,178,.30)
```

### Campo de formulário (input)
```
fundo var(--input) · borda 1px var(--border-strong) · radius var(--radius-ctrl)
padding 12px 14px · texto 14px · cor var(--text)
label acima: 12px / 600 / var(--text-muted)
```

### Card / stat
```
fundo var(--card) · borda 1px var(--border) · radius var(--radius-card) · padding 12–14px
número: 22–24px / 800 / -0.02em   ·   rótulo: 10.5px / 600 / var(--text-muted)
barra de progresso: trilho var(--border-strong), preenchimento gradiente do acento
```

### Bloco de agendamento (na grade)
```
position: absolute (top/height calculados pelo horário)
fundo tone.bg · borda-esquerda 3px tone.bar · radius 7px · padding 5–9px
linha 1 (serviço): 11.5–12px / 700 / tone.fg
linha 2 (cliente): 10.5–11px / texto secundário · linha 3 (horário): 9.5–10px
```

### Segmented control (Dia / Semana, Hoje / ‹ ›)
```
container: fundo var(--card) · borda var(--border-strong) · radius var(--radius-pill) · padding 3px
ativo: fundo var(--accent-soft) · cor var(--accent-text) · peso 700 · radius 7px
```

---

## 5. Lógica da grade (Agenda)

- Jornada exibida: **09:00–18:00** (ajustável por empresa via `slot_interval_min`).
- **`pxPorHora`** define a densidade: `82px` (visões dia/semana) ou `58px` (semana compacta de 7 dias).
- Posição do bloco: `topPx = (inícioMin − jornadaInícioMin) × pxPorHora/60`; `altura = duraçãoMin × pxPorHora/60`.
- Linhas de hora: `repeating-linear-gradient(to bottom, transparent 0, transparent (px-1), var(--grid-line) (px-1), var(--grid-line) px)`.
- Linha do "agora": 2px em `var(--accent)` + ponto de 8px, posicionada pelo horário atual.

> A âncora da grade (início da jornada no fuso da empresa) deve ser única entre `GET /availability` e o `POST` — coerência sob DST (ver PLANNING §10.2).

---

## 6. As 3 variações (escolha do layout)

**Agenda**
- **A · Semana clássica** — sidebar completa + grade Seg–Sáb. Mais próxima da referência; boa pra começar.
- **B · Dia por profissional** — rail de ícones + colunas por profissional + painel-resumo (ocupação, faturamento, próximos). Melhor para a operação do dia.
- **C · Semana compacta** — mini-calendário e filtros à esquerda, 7 dias densos. Visão panorâmica.

**Login**
- **A · Split com hero** — painel de marca + formulário. Recomendado pra primeira impressão.
- **B · Cartão centralizado** — mínimo, foco total no login.
- **C · Cartão com diferenciais** — formulário + os 3 pilares (tempo real, sem conflito, multi-profissional).

> Recomendação: **Agenda B** (operação) + **Login A** (marca). Mas os tokens acima servem a qualquer combinação.

---

## 7. Notas de implementação
- Mantenha o **acento como gradiente** só em botões/logo; em textos e ícones use a cor sólida (`--accent-text`).
- Raios: telas/molduras 3px, cards 14px, controles 10px, navegação/botões 9px.
- Sombra de card no claro: `0 1px 2px rgba(16,24,40,.05)`; elevação (login/modal): `0 24px 60px rgba(15,27,45,.10)`.
- O arquivo visual de referência fica em `Nexos Booking — Conceitos.dc.html` (abra no navegador pra inspecionar valores reais).
