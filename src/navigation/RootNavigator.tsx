import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { BreedDetailScreen } from '../features/breed-detail/BreedDetailScreen';
import { BreedListScreen } from '../features/breeds/BreedListScreen';
import { FiltersScreen } from '../features/breeds/FiltersScreen';
import { fonts, useTheme } from '../ui/theme';

export type RootStackParamList = {
  Breeds: undefined;
  Filters: undefined;
  BreedDetail: { id: string; name?: string; tab?: 'Overview' | 'Traits' | 'Gallery' };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

// dogbreeds://breed/<id>, dogbreeds://filters (also used by the Maestro E2E flow)
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/')],
  config: { screens: { Breeds: '', Filters: 'filters', BreedDetail: 'breed/:id' } },
};

export function RootNavigator() {
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer theme={theme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerTitleStyle: { fontFamily: fonts.bold },
          headerShadowVisible: false,
          headerBackTitle: 'Breeds',
        }}
      >
        <Stack.Screen name="Breeds" component={BreedListScreen} options={{ title: 'Dog Breeds' }} />
        <Stack.Screen name="Filters" component={FiltersScreen} options={{ presentation: 'modal', title: 'Filters' }} />
        <Stack.Screen
          name="BreedDetail"
          component={BreedDetailScreen}
          options={({ route }) => ({ title: route.params.name ?? 'Breed' })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
