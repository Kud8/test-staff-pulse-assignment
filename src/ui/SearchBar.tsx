import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { MAX_QUERY_LENGTH, type SearchFilter, type SearchResponse } from '#shared/search'
import { searchWithAi } from '#src/api/search'
import { describeFilter } from '#src/model/search'
import { Button, c, Muted } from '#src/ui/styles'

const Box = styled.div`
  padding: 13px 22px; border-bottom: 1px solid ${c.line};
  @media(max-width: 600px) { padding: 13px 16px; }
`
const Top = styled.div`display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap;`
const Modes = styled.div`display: inline-flex; gap: 2px; padding: 3px; background: #f2f3f7; border-radius: 10px;`
const ModeButton = styled.button`
  display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; padding: 7px 12px;
  background: transparent; color: ${c.body}; font-size: 12px; font-weight: 600;
  svg { color: ${c.accent}; }
  &[aria-pressed='true'] { background: ${c.surface}; color: ${c.text}; font-weight: 700; box-shadow: 0 1px 2px rgba(20, 25, 45, .08); }
`
const Form = styled.form<{ $ai: boolean }>`
  display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap;
  flex: ${p => p.$ai ? '1 1 100%' : '1 1 300px'};
  ${p => p.$ai && 'order: 1;'}
`
const Label = styled.label`font-size: 12px; font-weight: 600; color: ${c.body}; white-space: nowrap;`
// Пунктирная рамка отличает поле запроса к модели от обычного фильтра по названию.
const Input = styled.input<{ $ai: boolean }>`
  flex: 1 1 200px; min-width: 0; font: inherit; font-size: 12.5px; color: inherit; border-radius: 10px; padding: 8px 12px;
  background: ${p => p.$ai ? '#fafaff' : '#fafbfd'};
  border: ${p => p.$ai ? `1.5px dashed #b9c7d9` : `1px solid #dde2ea`};
  &::placeholder { color: #8d95a8; }
  &:focus-visible { outline: none; border-color: ${c.accent}; box-shadow: 0 0 0 3px rgba(19, 49, 92, .14); }
`
const Submit = styled(Button)`
  background: ${c.accent}; border-color: ${c.accent}; color: ${c.surface};
  &:hover:not(:disabled) { background: #0f2749; border-color: #0f2749; }
`
const Count = styled(Muted)`margin-left: auto; font-size: 11px; font-weight: 600; color: ${c.label};`
const Hint = styled(Muted)`margin-top: 8px; font-size: 12px;`
const Notice = styled.div`
  margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  color: ${c.body}; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere;
`
const Chip = styled.span`
  display: inline-flex; align-items: center; gap: 6px; border-radius: 20px; padding: 4px 12px;
  background: ${c.accentSoft}; color: ${c.accent}; font-size: 11px; font-weight: 700;
`
const reasons: Record<Extract<SearchResponse, { mode: 'text' }>['reason'], string> = {
  unconfigured: 'AI-поиск не настроен.', timeout: 'AI не ответил вовремя.', unavailable: 'AI временно недоступен.',
  invalid: 'Не удалось проверить ответ AI.', unsupported: 'Этот запрос нельзя представить доступными условиями.', busy: 'AI уже обрабатывает запрос.',
}

type Props = { onChange: (text: string, filter: SearchFilter | null) => void; count: number; total: number }
export function SearchBar({ onChange, count, total }: Props) {
  const id = useId()
  const [mode, setMode] = useState<'text' | 'ai'>('text')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  // Применённые условия показываются отдельной плашкой, причина отката — обычным текстом.
  const [applied, setApplied] = useState('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  const cancel = () => { active.current?.abort(); active.current = null; setPending(false) }
  const reset = () => { cancel(); setQuery(''); setNotice(''); setApplied(''); onChange('', null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode !== 'ai' || active.current || !query.trim()) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    try {
      const result = await searchWithAi(query.trim(), controller.signal)
      if (active.current !== controller) return
      if (result.mode === 'ai') {
        onChange('', result.filter)
        setApplied(describeFilter(result.filter))
        setNotice('')
      } else {
        onChange(query, null)
        setApplied('')
        setNotice(`${reasons[result.reason]} Применён обычный поиск по названию: «${query.trim()}».`)
      }
    } catch {
      // Отмена при вводе нового запроса, смене режима или размонтировании.
    } finally {
      if (active.current === controller) { active.current = null; setPending(false) }
    }
  }
  return <Box>
    <Top>
      <Modes role="group" aria-label="Способ поиска">
        <ModeButton type="button" aria-pressed={mode === 'text'} onClick={() => { reset(); setMode('text') }}>По названию</ModeButton>
        <ModeButton type="button" aria-pressed={mode === 'ai'} onClick={() => { reset(); setMode('ai') }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4z" /></svg>
          AI-поиск
        </ModeButton>
      </Modes>
      <Form onSubmit={event => void submit(event)} aria-busy={pending} $ai={mode === 'ai'}>
        <Label htmlFor={id}>{mode === 'text' ? 'Фильтр по названию' : 'Запрос к AI'}</Label>
        <Input id={id} type="search" value={query} maxLength={MAX_QUERY_LENGTH} autoComplete="off" spellCheck={false} $ai={mode === 'ai'}
          placeholder={mode === 'text' ? 'Например, продажи' : 'Спросите: какие команды с эффективностью ниже 60%?'}
          onChange={event => {
            cancel(); setQuery(event.target.value)
            if (mode === 'text') onChange(event.target.value, null)
          }} />
        {mode === 'ai' && <Submit type="submit" disabled={pending || !query.trim()}>{pending ? 'Распознаём…' : 'Найти с AI'}</Submit>}
        {(query || notice || applied) && <Button type="button" onClick={reset}>Сбросить</Button>}
      </Form>
      <Count aria-live="polite">{`Показано: ${count} из ${total}`}</Count>
    </Top>
    {mode === 'ai' && <Hint>Числовые условия относятся к суммам по поддереву. Запрос отправляется по кнопке.</Hint>}
    {(pending || notice || applied) && <Notice role="status">
      {pending ? 'Распознаём условия запроса…' : applied ? <>Применено: <Chip>{applied}</Chip></> : notice}
    </Notice>}
  </Box>
}
