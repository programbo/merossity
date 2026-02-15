/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */
import { createRoot } from 'react-dom/client'
import App from './App'
import { MotionProvider } from './ui/motion/MotionProvider'

function start() {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <MotionProvider>
      <App />
    </MotionProvider>,
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
