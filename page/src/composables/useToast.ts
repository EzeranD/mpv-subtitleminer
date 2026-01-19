import { readonly, ref, type Ref } from 'vue'

const TOAST_DURATION = 5000

const TOAST_CONFIG = {
  info: { icon: 'ℹ' },
  success: { icon: '✓' },
  error: { icon: '✗' },
  warning: { icon: '⚠' },
} as const

export type ToastType = keyof typeof TOAST_CONFIG
export type ToastAction = { label: string; onClick: () => void }
export type Toast = { id: number; message: string; type: ToastType; action?: ToastAction }
export type ToastOptions = { duration?: number; action?: ToastAction }

export const toastIcons: Record<ToastType, string> = Object.fromEntries(
  (Object.entries(TOAST_CONFIG) as [ToastType, (typeof TOAST_CONFIG)[ToastType]][]).map(
    ([type, config]) => [type, config.icon],
  ),
) as Record<ToastType, string>

const toasts = ref<Toast[]>([])
let nextToastId = 1

function dismissToast(id: number) {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

function pushToast(
  message: string,
  type: ToastType = 'info',
  duration = TOAST_DURATION,
  action?: ToastAction,
) {
  const id = nextToastId++
  toasts.value.push({ id, message, type, action })
  window.setTimeout(() => dismissToast(id), duration)
  return id
}

export type ToastFn = (message: string, options?: ToastOptions) => number
export type ToastApi = Record<ToastType, ToastFn>

function createToast(type: ToastType): ToastFn {
  return (message: string, options?: ToastOptions) =>
    pushToast(message, type, options?.duration ?? TOAST_DURATION, options?.action)
}

const toastTypes = Object.keys(TOAST_CONFIG) as ToastType[]
const toast: ToastApi = toastTypes.reduce((api, type) => {
  api[type] = createToast(type)
  return api
}, {} as ToastApi)

export type UseToast = {
  toasts: Readonly<Ref<readonly Toast[]>>
  toast: ToastApi
  toastIcons: Record<ToastType, string>
  dismissToast: (id: number) => void
}

export function useToast(): UseToast {
  return {
    toasts: readonly(toasts),
    toast,
    toastIcons,
    dismissToast,
  }
}
