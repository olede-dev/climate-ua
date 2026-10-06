import { globalIgnores } from 'eslint/config'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { vueTsConfigs, withVueTs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default withVueTs(
  globalIgnores(['dist/**', 'coverage/**']),
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'climate-ua/node-scripts',
    files: ['scripts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  skipFormatting,
)
