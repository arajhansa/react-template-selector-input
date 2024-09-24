import React, { useCallback, useEffect, useMemo, useRef, useState, } from 'react'
import { createEditor, Descendant, Editor, Range, Transforms } from 'slate'
import { Editable, ReactEditor, Slate, useFocused, useSelected, withReact, } from 'slate-react'
import { withHistory } from 'slate-history'
import './TemplateSelector.css'

const VARIABLE_NODE = 'variable'

function filterOp(options, size) {
  return (search) => options
  .filter(opt => opt.toLowerCase().startsWith(search.toLowerCase()))
  .slice(0, size);
}

function getInitialValue(defaultValue: string, filter: (string) => string[]): Descendant[] {
  const initialValue = [{ type: 'paragraph', children: [{ text: '' }] }]
  const nodes = initialValue[0].children

  for (let i = 0; i < defaultValue.length; i++) {
    if (defaultValue.charAt(i) !== '$') {
      nodes[nodes.length - 1].text += defaultValue.charAt(i)
    } else {
      let varName = ''
      for (i += 2; defaultValue.charAt(i) !== '}'; i++)
        varName += defaultValue?.charAt(i)
      if (filter(varName)[0] === varName) {
        nodes.push(getNode(varName) as any)
        nodes.push({ text: '' })
      } else {
        nodes[nodes.length - 1].text += `$${varName}`
      }
    }
  }

  return initialValue
}

function getNode(variable) {
  return {
    type: VARIABLE_NODE,
    variable,
    children: [{ text: '' }]
  }
}

export default function TemplateSelector({ defaultValue, options, size, placeholder }) {
  const filter = filterOp(options, size)
  const initialValue = getInitialValue(defaultValue ?? '', filter);

  const ref = useRef<HTMLDivElement | null>()
  const [index, setIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<Range | undefined>()
  const [value, setValue] = useState<Descendant[]>(initialValue)

  const chars = filter(search)

  console.log(getCompiledText())

  function insertVariable(editor, variable) {
    Transforms.insertNodes(editor, getNode(variable))
    Transforms.move(editor)
  }

  function Element(props) {
    switch (props.element.type) {
      case VARIABLE_NODE:
        return <VariableNode {...props} />
      default:
        return <p {...props} />
    }
  }

  function getCompiledText() {
    const nodes = value.length > 0 ? (value[0] as any).children : [];
    return nodes.map(it => it.type === VARIABLE_NODE ? `$\{${it.variable}}` : it.text).join('');
  }

  function handleValueChange(value: Descendant[]) {
    setValue(value ?? getInitialValue('', filter))

    const { selection } = editor
    if (!selection || !Range.isCollapsed(selection)) {
      setTarget(undefined)
      return
    }

    const [start] = Range.edges(selection)
    const wordBefore = Editor.before(editor, start, { unit: 'word' })
    const before = wordBefore && Editor.before(editor, wordBefore)
    const beforeRange = before && Editor.range(editor, before, start)
    const beforeText = beforeRange && Editor.string(editor, beforeRange)
    const beforeMatch = beforeText && beforeText.match(/^@(\w+)$/)
    const after = Editor.after(editor, start)
    const afterRange = Editor.range(editor, start, after)
    const afterText = Editor.string(editor, afterRange)
    const afterMatch = afterText.match(/^(\s|$)/)

    if (!beforeMatch || !afterMatch) {
      return
    }

    setTarget(beforeRange)
    setSearch(beforeMatch[1])
    setIndex(0)
  }

  const editor = useMemo(
    () => withVariables(withSingleLine(withReact(withHistory(createEditor())))),
    []
  )

  const renderElement = useCallback(
    (props) => <Element {...props} />,
    []
  )

  const renderLeaf = useCallback(
    ({ attributes, children }) => <span {...attributes}>{children}</span>,
    []
  )

  const onKeyDown = useCallback(
    event => {
      if (!target || chars.length === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setIndex(index >= chars.length - 1 ? 0 : index + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          setIndex(index <= 0 ? chars.length - 1 : index - 1)
          break
        case 'Tab':
        case 'Enter':
          event.preventDefault()
          Transforms.select(editor, target)
          insertVariable(editor, chars[index])
          setTarget(undefined)
          break
        case 'Escape':
          event.preventDefault()
          setTarget(undefined)
          break
      }
    },
    [chars, editor, index, target]
  )

  useEffect(() => {
    if (target && chars.length > 0) {
      const el = ref.current!
      const domRange = ReactEditor.toDOMRange(editor, target)
      const rect = domRange.getBoundingClientRect()
      el.style.top = `${rect.top + window.pageYOffset + 24}px`
      el.style.left = `${rect.left + window.pageXOffset}px`
    }
  }, [chars.length, editor, index, search, target])

  return (
    <div className={"template-selector-container template-selector-container-default"}>
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={handleValueChange}
      >
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disableDefaultStyles
        />
      </Slate>
      {target && chars.length > 0 && (
        <div
          ref={ref as never}
          style={{
            position: 'absolute',
            zIndex: 1,
            padding: '3px',
            background: 'white',
            borderRadius: '4px',
            boxShadow: '0 1px 5px rgba(0,0,0,.2)',
          }}
        >
          {chars.map((char, i) => (
            <div
              key={char}
              onClick={() => {
                Transforms.select(editor, target)
                insertVariable(editor, char)
                setTarget(undefined)
              }}
              style={{
                padding: '1px 3px',
                borderRadius: '3px',
                cursor: 'pointer',
                background: i === index ? '#B4D5FF' : 'transparent',
              }}
            >
              {char}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function withVariables(editor) {
  const { isInline, isVoid, markableVoid } = editor

  editor.isInline = element => {
    return element.type === VARIABLE_NODE ? true : isInline(element)
  }

  editor.isVoid = element => {
    return element.type === VARIABLE_NODE ? true : isVoid(element)
  }

  editor.markableVoid = element => {
    return element.type === VARIABLE_NODE || markableVoid(element)
  }

  return editor
}

function withSingleLine<T extends Editor>(editor: T) {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (path.length === 0) {
      if (editor.children.length > 1) {
        Transforms.mergeNodes(editor);
      }
    }

    return normalizeNode([node, path]);
  };

  return editor;
}

function VariableNode({ attributes, children, element }) {
  const selected = useSelected()
  const focused = useFocused()

  const style: React.CSSProperties = {
    padding: '3px 3px 2px',
    margin: '0 1px',
    verticalAlign: 'baseline',
    display: 'inline-block',
    borderRadius: '4px',
    backgroundColor: selected && focused ? '#afafaf' : '#dcdbdb',
    fontSize: '0.9em',
  }

  return (
    <span {...attributes} style={style}>
      ${element.variable}
      {children}
    </span>
  )
}
