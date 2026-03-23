"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Search, Layers, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 100, damping: 20 } },
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground overflow-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 opacity-30 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] -z-10 h-[500px] w-[500px] rounded-full bg-primary/10 opacity-40 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        {/* Ultramodern Floating Navigation */}
        <motion.header 
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-6 left-1/2 z-50 flex w-[calc(100%-3rem)] max-w-5xl -translate-x-1/2 items-center justify-between rounded-full border border-border/50 bg-background/60 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-2xl saturate-150"
        >
          <div className="flex items-center gap-3 pl-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[inset_0_-2px_4px_rgba(0,0,0,0.2)]">
              <Zap className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight text-foreground">PhramAI.</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <Link href="/chat">
              <Button className="h-9 rounded-full px-7 text-sm tracking-wide shadow-[0_0_20px_-5px_hsl(var(--primary))] transition-all hover:scale-105 hover:shadow-[0_0_30px_-5px_hsl(var(--primary))]">
                System Access
              </Button>
            </Link>
          </nav>
        </motion.header>

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center pb-24 pt-32 text-center md:pb-32 md:pt-40">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex max-w-4xl flex-col items-center gap-8"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-sm font-medium text-muted-foreground backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
              Regulatory Intelligence v2.0
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-balance text-5xl font-extrabold tracking-tighter sm:text-7xl md:text-8xl">
              Navigate compliance with <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">neural precision.</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
              Transform raw regulatory data into actionable insights. Secure, multi-tenant, and designed for rigorous enterprise environments.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
              <Link href="/chat">
                <Button size="lg" className="w-full sm:w-auto group h-14 rounded-full px-8 text-base font-medium shadow-[0_0_40px_-10px_hsl(var(--primary))] transition-all hover:scale-105 hover:shadow-[0_0_60px_-15px_hsl(var(--primary))]">
                  Enter Workspace
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="#architecture">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 rounded-full px-8 text-base font-medium border-border/50 hover:bg-muted/50 backdrop-blur-sm">
                  View Architecture
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* Asymmetrical Bento Box Features */}
        <section className="pb-32" id="architecture">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Large Card */}
            <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 md:col-span-2 transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="absolute top-0 right-0 -mr-8 -mt-8 h-48 w-48 rounded-full bg-primary/5 blur-3xl transition-all group-hover:bg-primary/10" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-12">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/20">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-3xl font-bold tracking-tight mb-3">Semantic Discovery</h3>
                  <p className="max-w-md text-muted-foreground text-lg">
                    Interrogate thousands of compliance documents instantly. Exact paragraph citations guarantee complete traceability.
                  </p>
                </div>
              </div>
            </div>

            {/* Small Card 1 */}
            <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="relative z-10 flex h-full flex-col justify-between gap-12">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-foreground ring-1 ring-border">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight mb-2">Absolute Isolation</h3>
                  <p className="text-muted-foreground">
                    Strict multi-tenant architecture ensures data boundaries are never crossed.
                  </p>
                </div>
              </div>
            </div>

            {/* Small Card 2 */}
            <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="relative z-10 flex h-full flex-col justify-between gap-12">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-foreground ring-1 ring-border">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight mb-2">Modular Core</h3>
                  <p className="text-muted-foreground">
                    Built on scalable, stateless endpoints compatible with modern cloud infra.
                  </p>
                </div>
              </div>
            </div>

            {/* Wide Card */}
            <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 md:col-span-2 transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
              <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8 h-full">
                <div className="flex flex-col gap-6 max-w-sm">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/20">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Enterprise Grade</h3>
                    <p className="text-muted-foreground">
                      SOC2 ready. End-to-end encryption. Uncompromising state persistence.
                    </p>
                  </div>
                </div>
                <Button variant="ghost" className="w-fit p-0 hover:bg-transparent text-primary group-hover:text-primary/80 transition-colors">
                  Read security whitepaper <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/40 py-12 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="font-semibold text-foreground">PhramAI.</span>
          </div>
          <p>Confidential and Proprietary. Engineered for precision.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="#" className="hover:text-foreground transition-colors">System Status</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
