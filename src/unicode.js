const lrRanges = [
  [1470, 1470], [1472, 1472], [1475, 1475], [1478, 1478], [1488, 1514], [1520, 1524], [1544, 1544], [1547, 1547],
  [1549, 1549], [1563, 1564], [1566, 1610], [1645, 1647], [1649, 1749], [1765, 1766], [1774, 1775], [1786, 1805],
  [1807, 1808], [1810, 1839], [1869, 1957], [1969, 1969], [1984, 2026], [2036, 2037], [2042, 2042], [2048, 2069],
  [2074, 2074], [2084, 2084], [2088, 2088], [2096, 2110], [2112, 2136], [2142, 2142], [2144, 2154], [2208, 2228],
  [2230, 2237], [8207, 8207], [64285, 64285], [64287, 64296], [64298, 64310], [64312, 64316], [64318, 64318],
  [64320, 64321], [64323, 64324], [64326, 64449], [64467, 64829], [64848, 64911], [64914, 64967], [65008, 65020],
  [65136, 65140], [65142, 65276], [67584, 67589], [67592, 67592], [67594, 67637], [67639, 67640], [67644, 67644],
  [67647, 67669], [67671, 67742], [67751, 67759], [67808, 67826], [67828, 67829], [67835, 67867], [67872, 67897],
  [67903, 67903], [67968, 68023], [68028, 68047], [68050, 68096], [68112, 68115], [68117, 68119], [68121, 68147],
  [68160, 68167], [68176, 68184], [68192, 68255], [68288, 68324], [68331, 68342], [68352, 68405], [68416, 68437],
  [68440, 68466], [68472, 68497], [68505, 68508], [68521, 68527], [68608, 68680], [68736, 68786], [68800, 68850],
  [68858, 68863], [124928, 125124], [125127, 125135], [125184, 125251], [125264, 125273], [125278, 125279],
  [126464, 126467], [126469, 126495], [126497, 126498], [126500, 126500], [126503, 126503], [126505, 126514],
  [126516, 126519], [126521, 126521], [126523, 126523], [126530, 126530], [126535, 126535], [126537, 126537],
  [126539, 126539], [126541, 126543], [126545, 126546], [126548, 126548], [126551, 126551], [126553, 126553],
  [126555, 126555], [126557, 126557], [126559, 126559], [126561, 126562], [126564, 126564], [126567, 126570],
  [126572, 126578], [126580, 126583], [126585, 126588], [126590, 126590], [126592, 126601], [126603, 126619],
  [126625, 126627], [126629, 126633], [126635, 126651]]

export const unicodeDataTable = {}

for (const range of lrRanges) {
  for (let charId = range[0]; charId <= range[1]; charId++) {
    unicodeDataTable[charId] = true
  }
}