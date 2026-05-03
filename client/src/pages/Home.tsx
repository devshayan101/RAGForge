import { Show, SignInButton, useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Sparkles, Zap, Shield, BarChart3 } from "lucide-react";

export default function Home() {
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isSignedIn) {
      setLocation("/dashboard");
    }
  }, [isSignedIn, setLocation]);

  if (isSignedIn) {
    return null;
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-blue-400" />
            <span className="text-2xl font-bold">RAGForge</span>
          </div>
          <SignInButton mode="modal">
            <Button>Sign In</Button>
          </SignInButton>

        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Advanced RAG Platform
        </h1>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
          Build, manage, and deploy sophisticated Retrieval-Augmented Generation pipelines with elegant simplicity.
        </p>
        <SignInButton mode="modal">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
            Get Started Free
          </Button>
        </SignInButton>

      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <Zap className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Fast Ingestion</h3>
            <p className="text-slate-400">Upload and process documents instantly with background processing.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <Shield className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Secure & Private</h3>
            <p className="text-slate-400">Enterprise-grade security with API keys and user authentication.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <BarChart3 className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Analytics</h3>
            <p className="text-slate-400">Track usage, performance metrics, and query statistics.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <Sparkles className="w-8 h-8 text-blue-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Streaming Chat</h3>
            <p className="text-slate-400">Real-time token streaming with source citations.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl font-bold mb-6">Ready to build your RAG pipeline?</h2>
        <SignInButton mode="modal">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
            Start Free Today
          </Button>
        </SignInButton>

      </section>
    </div>
  );
}
