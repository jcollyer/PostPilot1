import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';
type Size = 'md' | 'sm' | 'lg';

interface Props extends Omit<PressableProps, 'children' | 'className'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}

const base =
  'flex-row items-center justify-center rounded-lg active:opacity-80 disabled:opacity-50';

const variants: Record<Variant, { container: string; text: string; spinner: string }> = {
  primary: { container: 'bg-primary', text: 'text-white font-semibold', spinner: '#ffffff' },
  outline: {
    container: 'border border-border bg-white',
    text: 'text-slate-900 font-semibold',
    spinner: '#0f172a',
  },
  ghost: { container: 'bg-transparent', text: 'text-slate-700 font-semibold', spinner: '#334155' },
  destructive: {
    container: 'bg-destructive',
    text: 'text-white font-semibold',
    spinner: '#ffffff',
  },
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-5 py-4',
};

/**
 * App-wide button. Mirrors the web app's variant vocabulary (primary /
 * outline / ghost / destructive) so the two clients feel related. String
 * children are auto-wrapped in <Text>; pass nodes for icons.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  const v = variants[variant];
  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${v.container} ${sizes[size]}${className ? ` ${className}` : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : typeof children === 'string' ? (
        <Text className={v.text}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
