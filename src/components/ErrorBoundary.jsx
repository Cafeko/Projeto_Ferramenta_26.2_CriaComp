import { Component } from 'react'
import { XCircle } from 'lucide-react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props
      if (fallback) {
        return fallback(this.state.error, this.reset)
      }
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-6 max-w-md text-center">
            <XCircle className="mx-auto size-8 text-rose-400 mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">Erro na renderização</h2>
            <p className="text-sm text-slate-400 mb-4">{this.state.error.message}</p>
            <button
              onClick={this.reset}
              className="px-4 py-2 bg-cyan-400 text-slate-950 rounded-lg font-bold hover:bg-cyan-300 transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
