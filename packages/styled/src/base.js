// @flow
import * as React from 'react'
import type { ElementType } from 'react'
import {
  getDefaultShouldForwardProp,
  composeShouldForwardProps,
  type StyledOptions,
  type CreateStyled,
  type PrivateStyledComponent
} from './utils'
import { withEmotionCache, ThemeContext } from '@emotion/react'
import { getRegisteredStyles, insertStyles } from '@emotion/utils'
import { serializeStyles } from '@emotion/serialize'

const ILLEGAL_ESCAPE_SEQUENCE_ERROR = `You have illegal escape sequence in your template literal, most likely inside content's property value.
Because you write your CSS inside a JavaScript string you actually have to do double escaping, so for example "content: '\\00d7';" should become "content: '\\\\00d7';".
You can read more about this here:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#ES2018_revision_of_illegal_escape_sequences`

let isBrowser = typeof document !== 'undefined'

let createStyled: CreateStyled = (tag: any, options?: StyledOptions) => {
  if (process.env.NODE_ENV !== 'production') {
    if (tag === undefined) {
      throw new Error(
        'You are trying to create a styled element with an undefined component.\nYou may have forgotten to import it.'
      )
    }
  }
  const isReal = tag.__emotion_real === tag
  const baseTag = (isReal && tag.__emotion_base) || tag

  let identifierName
  let targetClassName
  let shouldTransformProp;
  if (options !== undefined) {
    identifierName = options.label
    targetClassName = options.target
    shouldTransformProp = options.shouldTransformProp
  }

  const shouldForwardProp = composeShouldForwardProps(tag, options, isReal)
  const defaultShouldForwardProp =
    shouldForwardProp || getDefaultShouldForwardProp(baseTag)
  const shouldUseAs = !defaultShouldForwardProp('as')

  return function<Props>(): PrivateStyledComponent<Props> {
    let args = arguments
    let styles =
      isReal && tag.__emotion_styles !== undefined
        ? tag.__emotion_styles.slice(0)
        : []

    if (identifierName !== undefined) {
      styles.push(`label:${identifierName};`)
    }
    if (args[0] == null || args[0].raw === undefined) {
      styles.push.apply(styles, args)
    } else {
      if (process.env.NODE_ENV !== 'production' && args[0][0] === undefined) {
        console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR)
      }
      styles.push(args[0][0])
      let len = args.length
      let i = 1
      for (; i < len; i++) {
        if (process.env.NODE_ENV !== 'production' && args[0][i] === undefined) {
          console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR)
        }
        styles.push(args[i], args[0][i])
      }
    }

    // $FlowFixMe: we need to cast StatelessFunctionalComponent to our PrivateStyledComponent class
    const Styled: PrivateStyledComponent<Props> = withEmotionCache(
      (props, cache, ref) => {
        const finalTag = (shouldUseAs && props.as) || baseTag

        let className = ''
        let classInterpolations = []
        let transformedProps = props

        if (shouldTransformProp) {
          transformedProps = {}
          for (let _key in props) {
            const [_newKey, _newValue] = shouldTransformProp(_key, props[_key])

            transformedProps[_newKey] = _newValue
          }
        }

        let mergedProps = transformedProps
        if (transformedProps.theme == null) {
          mergedProps = {}
          for (let key in transformedProps) {
            mergedProps[key] = transformedProps[key]
          }
          mergedProps.theme = React.useContext(ThemeContext)
        }

        if (typeof transformedProps.className === 'string') {
          className = getRegisteredStyles(
            cache.registered,
            classInterpolations,
            transformedProps.className
          )
        } else if (transformedProps.className != null) {
          className = `${transformedProps.className} `
        }

        const serialized = serializeStyles(
          styles.concat(classInterpolations),
          cache.registered,
          mergedProps
        )
        const rules = insertStyles(
          cache,
          serialized,
          typeof finalTag === 'string'
        )
        className += `${cache.key}-${serialized.name}`
        if (targetClassName !== undefined) {
          className += ` ${targetClassName}`
        }

        const finalShouldForwardProp =
          shouldUseAs && shouldForwardProp === undefined
            ? getDefaultShouldForwardProp(finalTag)
            : defaultShouldForwardProp

        let newProps = {}

        for (let key in transformedProps) {
          if (shouldUseAs && key === 'as') continue

          if (
            // $FlowFixMe
            finalShouldForwardProp(key)
          ) {
            newProps[key] = transformedProps[key]
          }
        }

        newProps.className = className
        newProps.ref = ref

        const ele = React.createElement(finalTag, newProps)
        if (!isBrowser && rules !== undefined) {
          let serializedNames = serialized.name
          let next = serialized.next
          while (next !== undefined) {
            serializedNames += ' ' + next.name
            next = next.next
          }
          return (
            <>
              <style
                {...{
                  [`data-emotion`]: `${cache.key} ${serializedNames}`,
                  dangerouslySetInnerHTML: { __html: rules },
                  nonce: cache.sheet.nonce
                }}
              />
              {ele}
            </>
          )
        }
        return ele
      }
    )

    Styled.displayName =
      identifierName !== undefined
        ? identifierName
        : `Styled(${
            typeof baseTag === 'string'
              ? baseTag
              : baseTag.displayName || baseTag.name || 'Component'
          })`

    Styled.defaultProps = tag.defaultProps
    Styled.__emotion_real = Styled
    Styled.__emotion_base = baseTag
    Styled.__emotion_styles = styles
    Styled.__emotion_forwardProp = shouldForwardProp

    Object.defineProperty(Styled, 'toString', {
      value() {
        if (
          targetClassName === undefined &&
          process.env.NODE_ENV !== 'production'
        ) {
          return 'NO_COMPONENT_SELECTOR'
        }
        // $FlowFixMe: coerce undefined to string
        return `.${targetClassName}`
      }
    })

    Styled.withComponent = (
      nextTag: ElementType,
      nextOptions?: StyledOptions
    ) => {
      return createStyled(nextTag, {
        ...options,
        // $FlowFixMe
        ...nextOptions,
        shouldForwardProp: composeShouldForwardProps(Styled, nextOptions, true)
      })(...styles)
    }

    return Styled
  }
}

export default createStyled
