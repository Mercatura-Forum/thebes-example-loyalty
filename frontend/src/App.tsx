import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from '@thebes/sdk'
import { Layout } from './components/Layout'
import { Card } from './pages/Card'
import { History } from './pages/History'
import { Admin } from './pages/Admin'

export function App() {
  return (
    <MemphisGate appName="Carat" tagline="Sign in to your rewards card.">
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Card />} />
        <Route path="/history" element={<History />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Card />} />
      </Route>
    </Routes>
    </MemphisGate>
  )
}
