import { DEFAULT_OPTIONS } from './leaflet-gridlayer-vms2/constants.js'
import setupMethods from './leaflet-gridlayer-vms2/setup.js'
import lifecycleMethods from './leaflet-gridlayer-vms2/lifecycle.js'
import overlayMethods from './leaflet-gridlayer-vms2/overlay.js'
import geometryMethods from './leaflet-gridlayer-vms2/geometry.js'
import geojsonMethods from './leaflet-gridlayer-vms2/geojson.js'
import layerDataMethods from './leaflet-gridlayer-vms2/layer-data.js'
import styleRenderingMethods from './leaflet-gridlayer-vms2/style-rendering.js'
import resourceLoaderMethods from './leaflet-gridlayer-vms2/resource-loader.js'
import renderMethods from './leaflet-gridlayer-vms2/render.js'
import mathMethods from './leaflet-gridlayer-vms2/math.js'

const MUTABLE_OPTION_NAMES = ['styleOverride']

const METHOD_GROUPS = [
  setupMethods,
  lifecycleMethods,
  overlayMethods,
  geometryMethods,
  geojsonMethods,
  layerDataMethods,
  styleRenderingMethods,
  resourceLoaderMethods,
  renderMethods,
  mathMethods
]

function cloneMutableOptionValue (value) {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(cloneMutableOptionValue)
  }

  const prototype = Object.getPrototypeOf(value)

  if (prototype !== Object.prototype && prototype !== null) {
    return value
  }

  const clone = {}

  for (const key of Object.keys(value)) {
    clone[key] = cloneMutableOptionValue(value[key])
  }

  return clone
}

function assertLeafletGridLayerAvailable (leaflet) {
  if (!leaflet || !leaflet.GridLayer || typeof leaflet.GridLayer.extend !== 'function' || !leaflet.gridLayer) {
    throw new Error('Leaflet must be loaded before Leaflet.GridLayer.VMS2')
  }
}

function createDefaultOptions () {
  const options = { ...DEFAULT_OPTIONS }

  for (const optionName of MUTABLE_OPTION_NAMES) {
    if (options[optionName] && typeof options[optionName] === 'object') {
      options[optionName] = cloneMutableOptionValue(options[optionName])
    }
  }

  return options
}

function copyMethodGroup (target, methodGroup) {
  if (!methodGroup || typeof methodGroup !== 'object' || Array.isArray(methodGroup)) {
    throw new TypeError('VMS2 method groups must be objects')
  }

  for (const methodName of Object.keys(methodGroup)) {
    if (methodName === 'options') {
      throw new Error('VMS2 method groups must not define options')
    }

    if (Object.hasOwn(target, methodName)) {
      throw new Error(`Duplicate VMS2 method "${methodName}"`)
    }

    if (typeof methodGroup[methodName] !== 'function') {
      throw new TypeError(`VMS2 method "${methodName}" must be a function`)
    }

    target[methodName] = methodGroup[methodName]
  }
}

function cloneMutableOptions (layer) {
  for (const optionName of MUTABLE_OPTION_NAMES) {
    const optionValue = layer.options[optionName]

    if (optionValue && typeof optionValue === 'object') {
      layer.options[optionName] = cloneMutableOptionValue(optionValue)
    }
  }
}

function createLayerDefinition () {
  const layerDefinition = {
    options: createDefaultOptions()
  }

  for (const methodGroup of METHOD_GROUPS) {
    copyMethodGroup(layerDefinition, methodGroup)
  }

  const initialize = layerDefinition.initialize

  if (typeof initialize !== 'function') {
    throw new Error('VMS2 layer definition must include initialize')
  }

  layerDefinition.initialize = function (options) {
    const result = initialize.call(this, options)

    cloneMutableOptions(this)

    return result
  }

  return layerDefinition
}

const leaflet = globalThis.L

assertLeafletGridLayerAvailable(leaflet)

leaflet.GridLayer.VMS2 = leaflet.GridLayer.extend(createLayerDefinition())

leaflet.gridLayer.vms2 = function (options) {
  return new leaflet.GridLayer.VMS2(options)
}
