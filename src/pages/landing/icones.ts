import {
  Award, BadgeCheck, BarChart3, Bell, Bot, Briefcase, Building2, CalendarClock, Check, CircleDollarSign, ClipboardList, Clock,
  Cloud, Database, FileCheck2, FileSearch, FileSignature, FileText, Gauge, Gavel, Globe, Handshake, Heart, History, KeyRound,
  Landmark, Lightbulb, Lock, Mail, MapPin, MessageCircle, Phone, PieChart, Radar, Rocket, Scale, ScanEye, Search, Send, ShieldCheck,
  ShoppingCart, Smartphone, Sparkles, Star, Target, ThumbsUp, Timer, TrendingUp, Trophy, Truck, Users, Wallet, X, Zap,
  type LucideIcon,
} from 'lucide-react'

/** Ícones que o master pode escolher na landing. Nome guardado no conteúdo → componente. */
export const ICONES: Record<string, LucideIcon> = {
  Sparkles, Radar, Gavel, CalendarClock, FileCheck2, FileSignature, FileSearch, FileText, Wallet, Building2, Users, ShoppingCart,
  Scale, ScanEye, Gauge, Database, Lock, KeyRound, History, BadgeCheck, ShieldCheck, Bell, Bot, Check, X, Award, BarChart3, Briefcase,
  CircleDollarSign, ClipboardList, Clock, Cloud, Globe, Handshake, Heart, Landmark, Lightbulb, Mail, MapPin, MessageCircle, Phone,
  PieChart, Rocket, Search, Send, Smartphone, Star, Target, ThumbsUp, Timer, TrendingUp, Trophy, Truck, Zap,
}
export const NOMES_ICONES = Object.keys(ICONES)
export const icone = (nome: string, padrao: LucideIcon = Sparkles) => ICONES[nome] ?? padrao
