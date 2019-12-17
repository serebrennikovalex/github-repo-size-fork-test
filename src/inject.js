/* global fetch, Request, Headers, chrome, localStorage */

const API = 'https://api.github.com/repos/'
const LI_TAG_ID = 'github-repo-size'
const GITHUB_TOKEN_KEY = 'x-github-token'
const MEASURES_SELECT_TAG_ID = 'github-repo-select'

const storage = chrome.storage.sync || chrome.storage.local

let githubToken

const MEASURES = ['AUTO', 'B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
let measureSelected = 'AUTO'

const getRepoObject = () => {
  // find file button
  const elem = document.querySelector('a.d-none.js-permalink-shortcut')
  if (!elem) return false

  if (!elem.href ||
      !elem.href.match(/^https?:\/\/github.com\//)) {
    return false
  }

  const repoUri = elem.href.replace(/^https?:\/\/github.com\//, '')
  const arr = repoUri.split('/')

  const userOrg = arr.shift()
  const repoName = arr.shift()
  const repo = `${userOrg}/${repoName}`

  arr.shift() // tree

  const ref = arr.shift()

  return {
    repo,
    ref,
    currentPath: arr.join('/').trim()
  }
}

const getHumanReadableSizeObject = (bytes) => {
  if (bytes === 0) {
    return {
      size: 0,
      measure: 'Bytes'
    }
  }

  let measure
  let i = 0

  const K = 1024

  if (measureSelected === 'AUTO') {
    i = Math.floor(Math.log(bytes) / Math.log(K))
    measure = MEASURES[i + 1]
  } else {
    i = MEASURES.indexOf(measureSelected) - 1
    measure = measureSelected
  }

  return {
    size: parseFloat((bytes / Math.pow(K, i)).toFixed(2)),
    measure
  }
}

const getHumanReadableSize = (size) => {
  if (!size) return ''

  const t = getHumanReadableSizeObject(size)

  return t.size + ' ' + t.measure
}

const getSizeHTML = (size) => {
  const humanReadableSize = getHumanReadableSizeObject(size)

  return [
    `<li id="${LI_TAG_ID}">`,
    '<svg class="octicon octicon-database" aria-hidden="true" height="16" version="1.1" viewBox="0 0 12 16" width="12">',
    '<path d="M6 15c-3.31 0-6-.9-6-2v-2c0-.17.09-.34.21-.5.67.86 3 1.5 5.79 1.5s5.12-.64 5.79-1.5c.13.16.21.33.21.5v2c0 1.1-2.69 2-6 2zm0-4c-3.31 0-6-.9-6-2V7c0-.11.04-.21.09-.31.03-.06.07-.13.12-.19C.88 7.36 3.21 8 6 8s5.12-.64 5.79-1.5c.05.06.09.13.12.19.05.1.09.21.09.31v2c0 1.1-2.69 2-6 2zm0-4c-3.31 0-6-.9-6-2V3c0-1.1 2.69-2 6-2s6 .9 6 2v2c0 1.1-2.69 2-6 2zm0-5c-2.21 0-4 .45-4 1s1.79 1 4 1 4-.45 4-1-1.79-1-4-1z"></path>',
    '</svg>',
    `<span class="num text-emphasized"> ${humanReadableSize.size}</span> ${humanReadableSize.measure}`,
    '</li>'
  ].join('')
}

const checkStatus = (response) => {
  if (response.status >= 200 && response.status < 300) {
    return response
  }

  console.error(response)
  throw Error(`GitHub returned an invalid status: ${response.status}`)
}

const getAPIData = (uri) => {
  const headerObj = {
    'User-Agent': 'harshjv/github-repo-size'
  }

  const token = localStorage.getItem(GITHUB_TOKEN_KEY) || githubToken

  if (token) {
    headerObj['Authorization'] = 'token ' + token
  }

  const request = new Request(`${API}${uri}`, {
    headers: new Headers(headerObj)
  })

  return fetch(request)
    .then(checkStatus)
    .then(response => response.json())
}

const getFileName = text => text.trim().split('/')[0]

const checkForRepoPage = async () => {
  const repoObj = getRepoObject()
  if (!repoObj) return

  const ns = document.querySelector('ul.numbers-summary')
  const liElem = document.getElementById(LI_TAG_ID)
  const tdElems = document.querySelector('span.github-repo-size-td')

  if (ns && !liElem) {
    getAPIData(repoObj.repo).then(summary => {
      if (summary && summary.size) {
        ns.insertAdjacentHTML('beforeend', getSizeHTML(summary.size * 1024))
        const newLiElem = document.getElementById(LI_TAG_ID)
        newLiElem.title = 'Click to load folder sizes'
        newLiElem.style.cssText = 'cursor: pointer'
        newLiElem.onclick = loadFolderSizes
      }
    })
  }

  if (tdElems) return

  const tree = await getAPIData(`${repoObj.repo}/contents/${repoObj.currentPath}?ref=${repoObj.ref}`)
  const sizeObj = { '..': '..' }

  for (let item of tree) {
    sizeObj[item.name] = item.type !== 'dir' ? item.size : 'dir'
  }

  let list = document.querySelectorAll('table tbody tr.js-navigation-item')
  let items = document.querySelectorAll('table tbody tr.js-navigation-item td:nth-child(2) a')
  let ageForReference = document.querySelectorAll('table tbody tr.js-navigation-item td:last-child')

  if (!list) {
    await new Promise((resolve, reject) => {
      setTimeout(function () {
        list = document.querySelectorAll('table tbody tr.js-navigation-item')
        items = document.querySelectorAll('table tbody tr.js-navigation-item td:nth-child(2) a')
        ageForReference = document.querySelectorAll('table tbody tr.js-navigation-item td:last-child')
      }, 1000)
    })
  }

  let i = 0

  for (let item of items) {
    const t = sizeObj[getFileName(item.text)]

    const td = document.createElement('td')
    td.className = 'age github-repo-size-file'

    let label

    if (t === 'dir') {
      label = '&middot;&middot;&middot;'
      td.className += ' github-repo-size-folder'
      td.title = 'Click to load folder size'
      td.style.cssText = 'cursor: pointer'
      td.onclick = loadFolderSizes
    } else if (t === '..') {
      label = ''
    } else {
      label = getHumanReadableSize(t)
    }

    td.innerHTML = `<span class="css-truncate css-truncate-target github-repo-size-td">${label}</span>`

    list[i].insertBefore(td, ageForReference[i++])
  }
}

const loadFolderSizes = async () => {
  const files = document.querySelectorAll('table tbody tr.js-navigation-item:not(.up-tree) td.content a')
  const folderSizes = document.querySelectorAll('td.github-repo-size-folder > span')
  const liElem = document.getElementById(LI_TAG_ID)

  if (liElem) {
    liElem.onclick = null
    liElem.title = null
  }

  for (let folderSize of folderSizes) {
    folderSize.textContent = '...'
    folderSize.parentElement.onclick = null
  }

  const repoObj = getRepoObject()
  if (!repoObj) return

  const data = await getAPIData(`${repoObj.repo}/git/trees/${repoObj.ref}?recursive=1`)

  if (data.truncated) {
    console.warn('github-repo-size: Data truncated. Folder size info may be incomplete.')
  }

  const sizeObj = {}

  for (let item of data.tree) {
    if (!item.path.startsWith(repoObj.currentPath)) continue

    const arr = item.path
      .replace(new RegExp(`^${repoObj.currentPath}`), '')
      .replace(/^\//, '')
      .split('/')

    if (arr.length >= 2 && item.type === 'blob') {
      const dir = arr[0]
      if (sizeObj[dir] === undefined) sizeObj[dir] = 0
      sizeObj[dir] += item.size
    }
  }

  let i = 0

  for (const folderSize of folderSizes) {
    const t = sizeObj[getFileName(files[i++].text)]
    folderSize.textContent = getHumanReadableSize(t)
  }
}

const getSelectMeasureHTML = () => {
  const options = MEASURES.map(measure => {
    return `<option value="${measure}">${measure}</option>`
  }).join('')

  return `<select id="${MEASURES_SELECT_TAG_ID}">${options}</select>`
}

const addMeasuresSelect = async () => {
  const repoObj = getRepoObject()
  if (!repoObj) return

  const divCT = document.querySelector('div.commit-tease')
  const selectElem = document.getElementById(MEASURES_SELECT_TAG_ID)

  if (divCT && !selectElem) {
    divCT.insertAdjacentHTML('beforeend', getSelectMeasureHTML())

    const newSelectElem = document.getElementById(MEASURES_SELECT_TAG_ID)

    newSelectElem.style.cssText = `cursor: pointer; margin-left: 10px;`
    newSelectElem.onchange = changeMeasureSize
  }
}

const changeMeasureSize = () => {
  measureSelected = document.getElementById(MEASURES_SELECT_TAG_ID).value
  updateTypeSize()
}

const updateTypeSize = async () => {
  const repoObj = getRepoObject()
  const tdElems = document.querySelector('span.github-repo-size-td')

  if (!repoObj || !tdElems) return

  const tree = await getAPIData(`${repoObj.repo}/contents/${repoObj.currentPath}?ref=${repoObj.ref}`)
  const sizeObj = { '..': '..' }

  for (let item of tree) {
    sizeObj[item.name] = item.type !== 'dir' ? item.size : 'dir'
  }

  let list = document.querySelectorAll('table tbody tr.js-navigation-item')
  let items = document.querySelectorAll('table tbody tr.js-navigation-item td:nth-child(2) a')

  if (!list) {
    await new Promise((resolve, reject) => {
      setTimeout(function () {
        list = document.querySelectorAll('table tbody tr.js-navigation-item')
        items = document.querySelectorAll('table tbody tr.js-navigation-item td:nth-child(2) a')
      }, 1000)
    })
  }

  let i = 0

  for (let item of items) {
    const parent = list[i]
    let label

    const t = sizeObj[getFileName(item.text)]
    const td = parent.querySelector('td.github-repo-size-file')

    if (t !== 'dir' && t !== '..') {
      label = getHumanReadableSize(t)
      td.innerHTML = `<span class="css-truncate css-truncate-target github-repo-size-td">${label}</span>`
    }
    i++
  }
}

storage.get(GITHUB_TOKEN_KEY, function (data) {
  githubToken = data[GITHUB_TOKEN_KEY]

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes[GITHUB_TOKEN_KEY]) {
      githubToken = changes[GITHUB_TOKEN_KEY].newValue
    }
  })

  document.addEventListener('pjax:end', checkForRepoPage, false)
  document.addEventListener('pjax:end', addMeasuresSelect, false)

  checkForRepoPage()
  addMeasuresSelect()
})
