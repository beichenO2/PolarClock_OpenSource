import { useState, useEffect, useCallback, useRef } from 'react'
import { Chess } from 'chess.js'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key, Color } from 'chessground/types'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'

interface Puzzle {
  id: string
  fen: string
  moves: string[]
  rating: number
  themes: string[]
}

interface PuzzleData {
  puzzles: Puzzle[]
  total: number
}

type HintLevel = 0 | 1 | 2 | 3

const THEME_LABELS: Record<string, string> = {
  mateIn1: '一步杀',
  mateIn2: '两步杀',
  mateIn3: '三步杀',
  fork: '捉双',
  pin: '牵制',
  skewer: '串击',
  sacrifice: '弃子',
  hangingPiece: '悬子',
  discoveredAttack: '闪击',
  deflection: '偏离',
  attraction: '引离',
  backRankMate: '底线杀',
  decoy: '引诱',
  classicBishopSac: '经典象弃',
  defense: '防御',
  development: '出子',
  opening: '开局',
  endgame: '残局',
  pawnBreak: '兵突破',
  centralControl: '控制中心',
  tempo: '先手',
  attack: '进攻',
  center: '中心',
  tactics: '战术',
}

function uciToSquares(uci: string): { from: Key; to: Key } {
  return {
    from: uci.slice(0, 2) as Key,
    to: uci.slice(2, 4) as Key,
  }
}

export default function ChessPuzzle({ onClose }: { onClose?: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null)
  const cgRef = useRef<Api | null>(null)
  const chessRef = useRef(new Chess())
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [moveIndex, setMoveIndex] = useState(0)
  const [status, setStatus] = useState<'thinking' | 'correct' | 'wrong' | 'complete'>('thinking')
  const [hint, setHint] = useState<HintLevel>(0)
  const [puzzlePool, setPuzzlePool] = useState<Puzzle[]>([])
  const [poolIndex, setPoolIndex] = useState(0)

  useEffect(() => {
    fetch('/clock/puzzles/puzzles.json')
      .then(r => r.json())
      .then((data: PuzzleData) => {
        const shuffled = [...data.puzzles].sort(() => Math.random() - 0.5)
        setPuzzlePool(shuffled)
        if (shuffled.length > 0) {
          setPuzzle(shuffled[0])
          setPoolIndex(0)
        }
      })
      .catch(() => {})
  }, [])

  const setupBoard = useCallback((p: Puzzle) => {
    const chess = chessRef.current
    chess.load(p.fen)
    setMoveIndex(0)
    setStatus('thinking')
    setHint(0)

    if (boardRef.current) {
      const orientation: Color = chess.turn() === 'w' ? 'white' : 'black'

      if (cgRef.current) {
        cgRef.current.destroy()
      }

      const cg = Chessground(boardRef.current, {
        fen: p.fen,
        orientation,
        turnColor: orientation,
        movable: {
          color: orientation,
          free: false,
          dests: toDests(chess),
        },
        draggable: { enabled: true },
        animation: { enabled: true, duration: 200 },
      })

      cg.set({
        events: {
          move: (orig: Key, dest: Key) => {
            handleUserMove(orig, dest, p, 0)
          },
        },
      })

      cgRef.current = cg
    }
  }, [])

  useEffect(() => {
    if (puzzle) setupBoard(puzzle)
  }, [puzzle, setupBoard])

  function toDests(chess: Chess): Map<Key, Key[]> {
    const dests = new Map<Key, Key[]>()
    for (const move of chess.moves({ verbose: true })) {
      const from = move.from as Key
      if (!dests.has(from)) dests.set(from, [])
      dests.get(from)!.push(move.to as Key)
    }
    return dests
  }

  function handleUserMove(orig: Key, dest: Key, p: Puzzle, idx: number) {
    const chess = chessRef.current
    const expectedUci = p.moves[idx]
    if (!expectedUci) return

    const expected = uciToSquares(expectedUci)
    const userUci = `${orig}${dest}`
    const expectedMove = `${expected.from}${expected.to}`

    if (userUci === expectedMove || userUci === expectedUci.slice(0, 4)) {
      const move = chess.move({ from: orig, to: dest, promotion: expectedUci.length === 5 ? expectedUci[4] as 'q' | 'r' | 'b' | 'n' : undefined })
      if (!move) {
        setStatus('wrong')
        setTimeout(() => { setupBoard(p) }, 800)
        return
      }

      cgRef.current?.set({ fen: chess.fen() })
      setStatus('correct')

      const nextIdx = idx + 1
      if (nextIdx >= p.moves.length) {
        setStatus('complete')
        setMoveIndex(nextIdx)
        return
      }

      setTimeout(() => {
        const opponentUci = p.moves[nextIdx]
        if (opponentUci) {
          const opp = uciToSquares(opponentUci)
          chess.move({ from: opp.from, to: opp.to, promotion: opponentUci.length === 5 ? opponentUci[4] as 'q' | 'r' | 'b' | 'n' : undefined })
          cgRef.current?.set({
            fen: chess.fen(),
            lastMove: [opp.from, opp.to],
          })

          const nextNext = nextIdx + 1
          if (nextNext >= p.moves.length) {
            setStatus('complete')
            setMoveIndex(nextNext)
          } else {
            setMoveIndex(nextNext)
            setStatus('thinking')
            setHint(0)
            const color: Color = chess.turn() === 'w' ? 'white' : 'black'
            cgRef.current?.set({
              turnColor: color,
              movable: { color, dests: toDests(chess) },
              events: {
                move: (o: Key, d: Key) => handleUserMove(o, d, p, nextNext),
              },
            })
          }
        }
      }, 500)
    } else {
      chess.load(chess.fen())
      cgRef.current?.set({ fen: chess.fen() })
      setStatus('wrong')
      setTimeout(() => {
        setStatus('thinking')
        const color: Color = chess.turn() === 'w' ? 'white' : 'black'
        cgRef.current?.set({
          movable: { color, dests: toDests(chess) },
          events: {
            move: (o: Key, d: Key) => handleUserMove(o, d, p, idx),
          },
        })
      }, 600)
    }
  }

  function showHint() {
    if (!puzzle || moveIndex >= puzzle.moves.length) return
    const nextLevel = Math.min(hint + 1, 3) as HintLevel
    setHint(nextLevel)

    const uci = puzzle.moves[moveIndex]
    const { from, to } = uciToSquares(uci)

    if (nextLevel === 1) {
      cgRef.current?.set({
        drawable: { shapes: [{ orig: from, brush: 'green' }] },
      })
    } else if (nextLevel === 2) {
      cgRef.current?.set({
        drawable: { shapes: [
          { orig: from, brush: 'green' },
          { orig: to, brush: 'yellow' },
        ]},
      })
    } else if (nextLevel === 3) {
      cgRef.current?.set({
        drawable: { shapes: [{ orig: from, dest: to, brush: 'green' }] },
      })
    }
  }

  function nextPuzzle() {
    const next = (poolIndex + 1) % puzzlePool.length
    setPoolIndex(next)
    setPuzzle(puzzlePool[next])
  }

  if (!puzzle) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
        加载习题中...
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center justify-between w-full max-w-[320px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            ♟ Rating {puzzle.rating}
          </span>
          <div className="flex gap-1 flex-wrap">
            {puzzle.themes.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {THEME_LABELS[t] || t}
              </span>
            ))}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">
            ✕
          </button>
        )}
      </div>

      <div
        ref={boardRef}
        className="rounded-lg overflow-hidden shadow-lg"
        style={{ width: 300, height: 300 }}
      />

      <div className="flex items-center gap-2 h-8">
        {status === 'correct' && (
          <span className="text-green-600 dark:text-green-400 font-medium text-sm">正确!</span>
        )}
        {status === 'wrong' && (
          <span className="text-red-500 dark:text-red-400 font-medium text-sm">再试试</span>
        )}
        {status === 'complete' && (
          <span className="text-green-600 dark:text-green-400 font-bold text-sm">习题完成!</span>
        )}
        {status === 'thinking' && (
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            {chessRef.current.turn() === 'w' ? '白方' : '黑方'}走棋
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {status !== 'complete' && (
          <button
            onClick={showHint}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800 transition-colors"
          >
            提示 ({3 - hint})
          </button>
        )}
        <button
          onClick={nextPuzzle}
          className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
        >
          {status === 'complete' ? '下一题' : '跳过'}
        </button>
      </div>
    </div>
  )
}
