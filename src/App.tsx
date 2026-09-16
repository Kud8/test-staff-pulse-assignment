import { Dashboard } from '#src/ui/Dashboard'
import { useLiveOrg } from '#src/ui/useLiveOrg'
import { Brand, Button, Connection, GlobalStyle, Header, Intro, Logo, Main, Muted, Panel, RefreshNotice, State, VisuallyHidden } from '#src/ui/styles'

const connectionLabels = { connecting: 'Подключаемся…', online: 'В сети', offline: 'Нет связи, переподключаемся' } as const

export default function App() {
  const { query, snapshot, highlights, status } = useLiveOrg()
  const hasTree = snapshot !== null && snapshot.tree.roots.length > 0
  return <>
    <GlobalStyle />
    <Header>
      <Logo src="/logo.png" alt="" width={32} height={32} /><Brand>Staff Pulse</Brand>
      {hasTree && <Connection role="status" $status={status}>
        <VisuallyHidden>Соединение: </VisuallyHidden>{connectionLabels[status]}
      </Connection>}
    </Header>
    <Main>
      <Intro><h1>Структура компании</h1><Muted>Дивизион → отдел → команда</Muted></Intro>
      {query.data !== undefined && query.isError && <RefreshNotice role="alert">
        <div><strong>Не удалось обновить данные</strong><Muted>{query.error.message}. Показаны последние загруженные данные.</Muted></div>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Обновляем…' : 'Повторить обновление'}</Button>
      </RefreshNotice>}
      {hasTree ? <Dashboard snapshot={snapshot} highlights={highlights} />
        : <Panel aria-label="Организационная структура" aria-busy={query.isPending}>
          {query.isPending ? <State role="status"><h2>Загружаем структуру…</h2><Muted>Получаем данные подразделений.</Muted></State>
            : query.data === undefined && query.isError ? <State role="alert"><h2>Не удалось загрузить данные</h2><Muted>{query.error.message}</Muted><Button disabled={query.isFetching} onClick={() => void query.refetch()}>Повторить загрузку</Button></State>
              : <State role="status"><h2>Подразделений пока нет</h2><Muted>Здесь появится организационная структура компании.</Muted></State>}
        </Panel>}
    </Main>
  </>
}
