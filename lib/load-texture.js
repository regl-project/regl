/* globals document, Image, XMLHttpRequest */

module.exports = loadTexture

function getExtension (url) {
  var parts = /\.(\w+)(\?.*)?$/.exec(url)
  if (parts && parts[1]) {
    return parts[1].toLowerCase()
  }
}

function isVideoExtension (url) {
  return [
    'avi',
    'asf',
    'gifv',
    'mov',
    'qt',
    'yuv',
    'mpg',
    'mpeg',
    'm2v',
    'mp4',
    'm4p',
    'm4v',
    'ogg',
    'ogv',
    'vob',
    'webm',
    'wmv'
  ].indexOf(url) >= 0
}

function isCompressedExtension (url) {
  return [
    // 'dds'
  ].indexOf(url) >= 0
}

function loadVideo (url) {
  var video = document.createElement('video')
  video.autoplay = true
  video.loop = true
  video.src = url
  return video
}

function loadCompressedTexture (url) {
  var xhr = new XMLHttpRequest()
  xhr.responseType = 'arraybuffer'
  xhr.open('GET', url, true)
  xhr.send()
  return xhr
}

function loadImage (url) {
  var image = new Image()
  image.src = url
  return image
}

// Currently this stuff only works in a DOM environment
function loadTexture (url) {
  if (typeof document !== 'undefined') {
    var ext = getExtension(url)
    if (isVideoExtension(ext)) {
      return loadVideo(url)
    }
    if (isCompressedExtension(ext)) {
      return loadCompressedTexture(url)
    }
    return loadImage(url)
  }
  return null
}
