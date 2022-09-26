import { isAbsolute, relative } from 'pathe'
import type { Component, Nuxt, NuxtPluginTemplate, NuxtTemplate } from '@nuxt/schema'
import { genDynamicImport, genExport, genObjectFromRawEntries } from 'knitwork'

export interface ComponentsTemplateContext {
  nuxt: Nuxt
  options: {
    getComponents: (mode?: 'client' | 'server' | 'all') => Component[]
    mode?: 'client' | 'server'
  }
}

export type ImportMagicCommentsOptions = {
  chunkName: string
  prefetch?: boolean | number
  preload?: boolean | number
}

const createImportMagicComments = (options: ImportMagicCommentsOptions) => {
  const { chunkName, prefetch, preload } = options
  return [
    `webpackChunkName: "${chunkName}"`,
    prefetch === true || typeof prefetch === 'number' ? `webpackPrefetch: ${prefetch}` : false,
    preload === true || typeof preload === 'number' ? `webpackPreload: ${preload}` : false
  ].filter(Boolean).join(', ')
}

export const componentsPluginTemplate: NuxtPluginTemplate<ComponentsTemplateContext> = {
  filename: 'components.plugin.mjs',
  getContents ({ options }) {
    const globalComponents = options.getComponents().filter(c => c.global === true)

    return `import { defineAsyncComponent } from 'vue'
import { defineNuxtPlugin } from '#app'

const components = ${genObjectFromRawEntries(globalComponents.map((c) => {
  const exp = c.export === 'default' ? 'c.default || c' : `c['${c.export}']`
  const comment = createImportMagicComments(c)

  return [c.pascalName, `defineAsyncComponent(${genDynamicImport(c.filePath, { comment })}.then(c => ${exp}))`]
}))}

export default defineNuxtPlugin(nuxtApp => {
  for (const name in components) {
    nuxtApp.vueApp.component(name, components[name])
    nuxtApp.vueApp.component('Lazy' + name, components[name])
  }
})
`
  }
}

export const componentsTemplate: NuxtTemplate<ComponentsTemplateContext> = {
  // components.[server|client].mjs'
  getContents ({ options }) {
    return [
      'import { defineAsyncComponent } from \'vue\'',
      ...options.getComponents(options.mode).filter(c => !c.island).flatMap((c) => {
        const exp = c.export === 'default' ? 'c.default || c' : `c['${c.export}']`
        const comment = createImportMagicComments(c)

        return [
          genExport(c.filePath, [{ name: c.export, as: c.pascalName }]),
          `export const Lazy${c.pascalName} = defineAsyncComponent(${genDynamicImport(c.filePath, { comment })}.then(c => ${exp}))`
        ]
      }),
      `export const componentNames = ${JSON.stringify(options.getComponents().filter(c => !c.island).map(c => c.pascalName))}`
    ].join('\n')
  }
}

export const componentsIslandsTemplate: NuxtTemplate<ComponentsTemplateContext> = {
  // components.islands.mjs'
  getContents ({ options }) {
    return options.getComponents().filter(c => c.island).map(
      (c) => {
        const exp = c.export === 'default' ? 'c.default || c' : `c['${c.export}']`
        const comment = createImportMagicComments(c)
        return `export const ${c.pascalName} = defineAsyncComponent(${genDynamicImport(c.filePath, { comment })}.then(c => ${exp}))`
      }
    ).join('\n')
  }
}

export const componentsTypeTemplate: NuxtTemplate<ComponentsTemplateContext> = {
  filename: 'components.d.ts',
  getContents: ({ options, nuxt }) => {
    const buildDir = nuxt.options.buildDir
    const componentTypes = options.getComponents().filter(c => !c.island).map(c => [
      c.pascalName,
      `typeof ${genDynamicImport(isAbsolute(c.filePath)
        ? relative(buildDir, c.filePath).replace(/(?<=\w)\.(?!vue)\w+$/g, '')
        : c.filePath.replace(/(?<=\w)\.(?!vue)\w+$/g, ''), { wrapper: false })}['${c.export}']`
    ])

    return `// Generated by components discovery
declare module '@vue/runtime-core' {
  export interface GlobalComponents {
${componentTypes.map(([pascalName, type]) => `    '${pascalName}': ${type}`).join('\n')}
${componentTypes.map(([pascalName, type]) => `    'Lazy${pascalName}': ${type}`).join('\n')}
  }
}

${componentTypes.map(([pascalName, type]) => `export const ${pascalName}: ${type}`).join('\n')}
${componentTypes.map(([pascalName, type]) => `export const Lazy${pascalName}: ${type}`).join('\n')}

export const componentNames: string[]
`
  }
}
