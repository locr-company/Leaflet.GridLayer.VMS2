export default class RandomGenerator {
  constructor () {
    this.state = 624
  }

  init_seed (number) {
    this.state = number
  }

  random () {
    let x = this.state

    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5

    this.state = x

    return (x / 0xffffffff) + 0.5
  }

  random_int () {
    let x = this.state

    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5

    this.state = x

    return x
  }

  random_pick (elements, elementCounts) {
    if (!elementCounts) {
      return elements[Math.floor(this.random() * elements.length)]
    }

    const expandedElements = []

    for (let elementIndex = 0; elementIndex < elements.length; elementIndex++) {
      for (let count = 0; count < elementCounts[elementIndex]; count++) {
        expandedElements.push(elements[elementIndex])
      }
    }

    return expandedElements[Math.floor(this.random() * expandedElements.length)]
  }
}
