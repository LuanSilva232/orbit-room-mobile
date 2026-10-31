import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-[#0b0f1f] px-4">
      <View className="items-center max-w-sm w-full p-6 bg-white/[0.04] border border-white/10 rounded-2xl shadow-2xl">
        
        <Text className="text-3xl font-bold uppercase tracking-[0.1em] text-center text-indigo-400">
          Orbit Room
        </Text>
        
        <Text className="mt-2 text-sm text-slate-400 text-center">
          Estrutura Mobile iniciada do zero com sucesso!
        </Text>

      </View>
      <StatusBar style="light" />
    </View>
  );
}
