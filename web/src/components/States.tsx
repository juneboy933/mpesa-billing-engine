import { LoaderCircle, TriangleAlert } from 'lucide-react'

export function LoadingState() { return <div className="state-panel"><LoaderCircle className="spin" size={22} /><span>Loading your workspace...</span></div> }
export function ErrorState({ message }: { message: string }) { return <div className="state-panel error-state"><TriangleAlert size={20} /><span>{message}</span></div> }
export function EmptyState({ title, copy }: { title: string; copy: string }) { return <div className="state-panel"><strong>{title}</strong><span>{copy}</span></div> }
