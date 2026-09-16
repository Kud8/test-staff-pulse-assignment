import styled, { createGlobalStyle, keyframes } from 'styled-components'

/** Палитра: холодный нейтральный фон, один тёмно-синий акцент и три сигнальных цвета. */
export const c = {
  bg: '#f3f5f9',
  surface: '#ffffff',
  text: '#1a1f36',
  body: '#40465c',
  muted: '#697386',
  /** Подписи колонок: на тон светлее текста, но всё ещё с контрастом 4.5:1. */
  label: '#69738a',
  border: '#e3e8ef',
  line: '#edf0f5',
  rowLine: '#f1f3f7',
  hover: '#f7f9fc',
  accent: '#13315c',
  accentSoft: '#e8eef5',
  selected: '#eef3f9',
  track: '#e2e6ee',
  good: '#1a8245',
  goodSoft: '#e3f5ea',
  warn: '#a06200',
  warnSoft: '#fcf1dc',
  bad: '#c0362c',
  badSoft: '#fbe4e1',
} as const

/** Пороги те же, что были: 80 и 60 процентов. Изменились только оттенки. */
export const performanceColor = (value: number) => value >= 80 ? c.good : value >= 60 ? c.warn : c.bad
export const performanceSoft = (value: number) => value >= 80 ? c.goodSoft : value >= 60 ? c.warnSoft : c.badSoft

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; }
  html { scroll-padding-top: 88px; }
  body {
    margin: 0; background: ${c.bg}; color: ${c.text}; font-size: 14px; -webkit-font-smoothing: antialiased;
    font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; scroll-margin-top: 88px; }
  button:disabled { cursor: wait; opacity: .6; }
  :focus-visible { outline: 2px solid ${c.accent}; outline-offset: 3px; }
  h1, h2, p { margin: 0; }
`
// Content is 1152px wide in single view and 1472px in the split view (≥1280px); the header aligns with it.
export const Header = styled.header`
  position: sticky; top: 0; z-index: 10; height: 64px;
  background: ${c.surface}; border-bottom: 1px solid ${c.border};
  padding: 0 max(24px, calc((100vw - 1152px) / 2));
  display: flex; align-items: center; gap: 10px;
  @media (min-width: 1280px) { padding: 0 max(24px, calc((100vw - 1472px) / 2)); }
`
export const Logo = styled.img`width: 36px; height: 36px; display: block; border-radius: 8px;`
export const Brand = styled.div`font-size: 15px; font-weight: 700; letter-spacing: -.01em;`
export const Connection = styled.div<{ $status: 'connecting' | 'online' | 'offline' }>`
  margin-left: auto; display: flex; align-items: center; gap: 7px; white-space: nowrap;
  font-size: 12px; font-weight: 600;
  color: ${p => p.$status === 'online' ? c.good : p.$status === 'offline' ? c.bad : c.warn};
  &::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  @media(max-width: 600px) { font-size: 11px; }
`
export const Muted = styled.p`color: ${c.muted}; line-height: 1.6; font-size: 13px;`
export const Main = styled.main`
  max-width: 1200px; margin: 0 auto; padding: 30px 24px 60px;
  /* В режиме «рядом» страница занимает ровно экран: прокручиваются сами панели, а не документ. */
  @media (min-width: 1280px) {
    max-width: 1520px; padding-bottom: 24px;
    height: calc(100vh - 64px); min-height: 520px; display: flex; flex-direction: column;
  }
  @media(max-width: 600px) { padding: 22px 12px 40px; }
`
export const Intro = styled.div`
  margin-bottom: 22px;
  h1 { font-size: clamp(24px, 3.4vw, 30px); letter-spacing: -.02em; font-weight: 800; }
  p { margin-top: 5px; }
`
export const Panel = styled.section`
  background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 14px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(20, 25, 45, .04);
`
export const Toolbar = styled.div`
  padding: 16px 22px; border-bottom: 1px solid ${c.line};
  display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap;
  h2 { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  h2 span { color: ${c.accent}; background: ${c.accentSoft}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
  h2 + p { margin-top: 4px; font-size: 12px; }
  @media(max-width: 600px) { padding: 14px 16px; }
`
export const Actions = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`
export const Button = styled.button`
  border: 1px solid #dde2ea; background: ${c.surface}; color: ${c.body};
  padding: 7px 12px; border-radius: 8px; font-weight: 600; font-size: 12px;
  &:hover { background: #f3f4f8; border-color: #c6cedb; }
`
export const State = styled.div`
  padding: 64px 24px; text-align: center; display: grid; justify-items: center; gap: 12px;
  h2 { font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
`
export const Footer = styled.div`padding: 14px 22px; border-top: 1px solid ${c.line}; color: ${c.muted}; font-size: 12px; line-height: 1.6;`

export const RefreshNotice = styled.div`
  margin: 0 0 16px; padding: 14px 16px; background: ${c.warnSoft}; border: 1px solid #efdcb2;
  border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  strong { display: block; margin-bottom: 4px; color: #7a4b00; font-size: 13px; }
`

/** Подпись для скринридера: в живой области aria-label подменял бы озвучиваемый текст. */
export const VisuallyHidden = styled.span`
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; white-space: nowrap; clip-path: inset(50%);
`

const fadeOut = keyframes`from { background: ${c.goodSoft}; } to { background: transparent; }`
/** A cell that a live patch has just changed: the highlight fades out over 1.5 s. */
export const Updated = styled.span`
  &[data-updated] {
    animation: ${fadeOut} 1500ms ease-out;
    @media(prefers-reduced-motion: reduce) { animation: none; background: ${c.goodSoft}; }
  }
`
