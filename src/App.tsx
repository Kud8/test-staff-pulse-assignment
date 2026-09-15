import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { orgQueryOptions } from '#src/api/query'
import { buildTree } from '#src/model/tree'
import { Dashboard } from '#src/ui/Dashboard'
import { RefreshNotice, Brand, Button, GlobalStyle, Header, Intro, Logo, Main, Muted, Panel, State } from '#src/ui/styles'

export default function App() {
  const query = useQuery(orgQueryOptions)
  const tree = useMemo(() => query.data ? buildTree(query.data) : null, [query.data])
  return <>
    <GlobalStyle />
    <Header><Logo aria-hidden="true">S</Logo><Brand>Staff Pulse</Brand></Header>
    <Main>
      <Intro><h1>Структура компании</h1></Intro>
      {query.data !== undefined && query.isError && <RefreshNotice role="alert">
        <div><strong>Не удалось обновить данные</strong><Muted>{query.error.message}. Показаны последние загруженные данные.</Muted></div>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Обновляем…' : 'Повторить обновление'}</Button>
      </RefreshNotice>}
      {tree && tree.roots.length > 0 ? <Dashboard tree={tree} />
        : <Panel aria-label="Организационная структура" aria-busy={query.isPending}>
          {query.isPending ? <State role="status"><h2>Загружаем структуру…</h2><Muted>Получаем данные подразделений.</Muted></State>
            : query.data === undefined && query.isError ? <State role="alert"><h2>Не удалось загрузить данные</h2><Muted>{query.error.message}</Muted><Button disabled={query.isFetching} onClick={() => void query.refetch()}>Повторить загрузку</Button></State>
              : <State role="status"><h2>Подразделений пока нет</h2><Muted>Здесь появится организационная структура компании.</Muted></State>}
        </Panel>}
    </Main>
  </>
}
