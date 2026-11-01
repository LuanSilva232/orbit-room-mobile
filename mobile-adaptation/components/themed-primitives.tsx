import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  View as NativeView,
} from 'react-native';
import { useAppTheme, type AppTheme } from '../lib/theme';
import { translateText, useAppLanguage } from '../lib/i18n';

type Color = { red: number; green: number; blue: number; alpha: number };

function parseColor(value: string): Color | null {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((digit) => digit + digit).join('')
      : hex[1];
    return {
      red: Number.parseInt(digits.slice(0, 2), 16),
      green: Number.parseInt(digits.slice(2, 4), 16),
      blue: Number.parseInt(digits.slice(4, 6), 16),
      alpha: 1,
    };
  }

  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return null;
  const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return {
    red: parts[0],
    green: parts[1],
    blue: parts[2],
    alpha: parts.length > 3 ? parts[3] : 1,
  };
}

function luminance(color: Color): number {
  return (color.red * 0.299 + color.green * 0.587 + color.blue * 0.114) * color.alpha +
    255 * (1 - color.alpha);
}

function rawLuminance(color: Color): number {
  return color.red * 0.299 + color.green * 0.587 + color.blue * 0.114;
}

function saturation(color: Color): number {
  const max = Math.max(color.red, color.green, color.blue);
  const min = Math.min(color.red, color.green, color.blue);
  return max === 0 ? 0 : (max - min) / max;
}

function mapTextColor(value: unknown, theme: AppTheme): unknown {
  if (theme.id === 'orbit' || typeof value !== 'string') return value;
  if ([theme.text, theme.muted, theme.accentText, theme.buttonText].includes(value)) {
    return value;
  }
  const color = parseColor(value);
  if (!color) return value;
  const lightness = luminance(color);
  const colorSaturation = saturation(color);

  if (colorSaturation > 0.24) {
    if (theme.id === 'light' && lightness > 170) return theme.text;
    if (color.blue > color.red * 1.12 && color.blue > color.green * 0.95) {
      return theme.accentText;
    }
    return value;
  }
  if (lightness > 170) return theme.text;
  if (lightness > 72) return theme.muted;
  return value;
}

function mapSurfaceColor(value: unknown, theme: AppTheme): unknown {
  if (theme.id === 'orbit' || typeof value !== 'string') return value;
  if (
    [theme.background, theme.surface, theme.raisedSurface, theme.input].includes(value)
  ) {
    return value;
  }
  const color = parseColor(value);
  if (!color) return value;
  const colorSaturation = saturation(color);
  const lightness = rawLuminance(color);
  if (color.alpha < 0.9 && lightness > 220) return theme.input;
  if (lightness < 80) return theme.raisedSurface;
  if (lightness < 150) {
    if (colorSaturation > 0.28) return value;
    return theme.surface;
  }
  if (colorSaturation > 0.28) return value;
  if (lightness > 220) return theme.input;
  return value;
}

function mapStyle(
  style: ViewProps['style'] | TextProps['style'] | TextInputProps['style'],
  theme: AppTheme,
  kind: 'view' | 'text' | 'input'
) {
  const flattened = StyleSheet.flatten(style);
  if (!flattened || theme.id === 'orbit') return style;

  const mapped = { ...flattened };
  if ('color' in mapped) mapped.color = mapTextColor(mapped.color, theme) as never;
  if ('backgroundColor' in mapped) {
    mapped.backgroundColor = mapSurfaceColor(mapped.backgroundColor, theme) as never;
  }
  if ('borderColor' in mapped) mapped.borderColor = theme.border;
  if ('borderTopColor' in mapped) mapped.borderTopColor = theme.border;
  if ('borderBottomColor' in mapped) mapped.borderBottomColor = theme.border;

  if (kind === 'input') {
    if ('color' in mapped) mapped.color = theme.text as never;
  }

  return mapped;
}

type ThemedViewProps = ViewProps & { preserveThemeColors?: boolean };

export function ThemedView({ preserveThemeColors, ...props }: ThemedViewProps) {
  const theme = useAppTheme();
  return (
    <NativeView
      {...props}
      style={preserveThemeColors ? props.style : mapStyle(props.style, theme, 'view')}
    />
  );
}

export function ThemedText(props: TextProps) {
  const theme = useAppTheme();
  useAppLanguage();
  const { children, ...textProps } = props;
  return (
    <NativeText
      {...textProps}
      accessibilityLabel={
        props.accessibilityLabel
          ? translateText(props.accessibilityLabel)
          : props.accessibilityLabel
      }
      style={[{ color: theme.text }, mapStyle(props.style, theme, 'text')]}
    >
      {typeof children === 'string'
        ? translateText(children)
        : Array.isArray(children)
          ? children.map((child) =>
              typeof child === 'string' ? translateText(child) : child
            )
          : children}
    </NativeText>
  );
}

export function ThemedTextInput(props: TextInputProps) {
  const theme = useAppTheme();
  useAppLanguage();
  return (
    <NativeTextInput
      {...props}
      accessibilityLabel={
        props.accessibilityLabel
          ? translateText(props.accessibilityLabel)
          : props.accessibilityLabel
      }
      placeholder={
        props.placeholder ? translateText(props.placeholder) : props.placeholder
      }
      placeholderTextColor={mapTextColor(props.placeholderTextColor, theme) as string}
      style={[
        { color: theme.text },
        mapStyle(props.style, theme, 'input'),
      ]}
    />
  );
}
