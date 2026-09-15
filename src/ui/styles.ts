import styled, { createGlobalStyle } from 'styled-components'

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; }
  html { scroll-padding-top: 88px; }
  body { margin: 0; background: #f6f7f9; color: #232b39; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; -webkit-font-smoothing: antialiased; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; scroll-margin-top: 88px; }
  button:disabled { cursor: wait; opacity: .6; }
  :focus-visible { outline: 2px solid #4263a6; outline-offset: 3px; }
  h1, h2, p { margin: 0; }
`
// Content is 1152px wide in single view and 1472px in the split view (≥1280px); the header aligns with it.
export const Header = styled.header`
  position: sticky; top: 0; z-index: 10; height: 68px;
  background: rgba(250, 251, 253, .84); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid #dfe3e9; padding: 0 max(24px, calc((100vw - 1152px) / 2));
  display: flex; align-items: center; gap: 10px;
  @media (min-width: 1280px) { padding: 0 max(24px, calc((100vw - 1472px) / 2)); }
`
export const Logo = styled.span`
  width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px;
  background: #263954; color: white; font-size: 16px; font-weight: 700;
`
export const Brand = styled.div`font-size: 16px; font-weight: 650; letter-spacing: -.4px;`
export const Muted = styled.p`color: #667184; line-height: 1.6; font-size: 13px;`
export const Main = styled.main`
  max-width: 1200px; margin: 0 auto; padding: 44px 24px 64px;
  @media (min-width: 1280px) { max-width: 1520px; padding-bottom: 24px; }
  @media(max-width: 600px) { padding: 28px 12px; }
`
export const Intro = styled.div`
  margin-bottom: 26px;
  h1 { font-size: clamp(27px, 4vw, 36px); letter-spacing: -1.2px; font-weight: 600; }
`
export const Panel = styled.section`background: white; border: 1px solid #dfe3e9; border-radius: 9px; overflow: hidden;`
export const Toolbar = styled.div`
  padding: 22px 28px; border-bottom: 1px solid #e6e9ee; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
  h2 { font-size: 16px; margin-bottom: 5px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  h2 span { color: #667184; font-size: 12px; font-weight: 500; border: 1px solid #dfe3e9; padding: 2px 7px; border-radius: 5px; }
  @media(max-width: 600px) { padding: 20px 16px; }
`
export const Actions = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`
export const Button = styled.button`
  border: 1px solid #d9dee6; background: white; color: #3b4960; padding: 8px 12px; border-radius: 5px; font-weight: 500; font-size: 13px;
  &:hover { background: #f2f4f8; border-color: #a5b0c1; }
`
export const State = styled.div`padding: 64px 24px; text-align: center; display: grid; justify-items: center; gap: 14px; h2 { font-size: 21px; }`
export const Footer = styled.div`padding: 16px 28px; border-top: 1px solid #e6e9ee; color: #606c7d; font-size: 12px; line-height: 1.6;`

export const RefreshNotice = styled.div`
  margin: 0 0 16px; padding: 14px 16px; background: #fff8e8; border: 1px solid #e8d6a9;
  border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  strong { display: block; margin-bottom: 4px; color: #705015; }
`
