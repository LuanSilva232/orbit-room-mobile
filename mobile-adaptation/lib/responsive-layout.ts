import { useWindowDimensions } from 'react-native';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;
  const isWide =
    width >= 820 ||
    (isLandscape && width >= 640) ||
    (isTablet && width >= 700);

  return {
    width,
    height,
    isLandscape,
    isTablet,
    isWide,
    horizontalPadding: isWide ? 28 : 18,
    pageMaxWidth: isWide ? 1200 : 680,
  };
}
