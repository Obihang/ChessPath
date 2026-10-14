import { CurriculumLevel } from '../types/curriculum';

export const CURRICULUM_LEVELS: CurriculumLevel[] = [
  {
    id: 1,
    title: 'Level 1: Absolute Basics',
    subtitle: 'Learn the board, pieces, moves, and core rules of chess.',
    badge: 'Beginner',
    description:
      'Master how the 64 squares work, how each piece maneuvers and captures, the critical difference between checkmate and stalemate, special moves like castling and en passant, and chess notation.',
    lessons: [
      {
        id: 'l1-board',
        levelId: 1,
        title: 'The Board & Coordinates',
        subtitle: 'Files, ranks, and naming squares',
        description:
          'A chessboard has 64 alternating light and dark squares arranged in 8 vertical columns called "files" (a through h) and 8 horizontal rows called "ranks" (1 through 8). Every square has a unique coordinate name, like e4 or c6. "White on right" means each player must have a light-colored square on their bottom-right corner.',
        steps: [
          {
            instruction: 'Move the white pawn to the center square e4.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['e4'],
            hint: 'Tap the pawn on e2 and push it two squares forward to e4.',
            explanation: 'Excellent! e4 is one of the most powerful first moves in chess, claiming control over key central squares.',
          },
        ],
      },
      {
        id: 'l1-pawn',
        levelId: 1,
        title: 'The Pawn: March & Attack',
        subtitle: 'Moving forward, capturing diagonally',
        description:
          'Pawns are the soul of chess! They move straight forward one square at a time, but on their very first move from rank 2 or 7, they have the option to leap two squares. Crucially, pawns capture diagonally one square forward—they cannot capture straight ahead, and they cannot move backwards.',
        steps: [
          {
            instruction: 'Capture the black pawn diagonally on d5.',
            fen: '8/8/8/3p4/4P3/8/8/4K2k w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['exd5'],
            hint: 'Pawns capture one square diagonally. Take the pawn on d5!',
            explanation: 'Spot on! Pawns always strike diagonally, making pawn chains formidable defensive barriers.',
          },
        ],
      },
      {
        id: 'l1-knight',
        levelId: 1,
        title: 'The Knight: The L-Shaped Leaper',
        subtitle: 'The only piece that can jump over others',
        description:
          'The knight moves in an "L-shape": two squares in one cardinal direction, then one square perpendicular. It is the only piece on the board capable of jumping directly over friendly or enemy pieces.',
        steps: [
          {
            instruction: 'Jump the knight to f3 to develop toward the center.',
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Nf3'],
            hint: 'Move the knight from g1 to f3.',
            explanation: 'Well played! Nf3 develops a piece, defends d4, and prepares kingside castling.',
          },
        ],
      },
      {
        id: 'l1-bishop',
        levelId: 1,
        title: 'The Bishop: The Diagonal Sniper',
        subtitle: 'Unlimited diagonal glide on its original color',
        description:
          'Bishops glide diagonally as far as they want along unobstructed paths. Because they only move diagonally, a bishop that starts on a light square can never step on a dark square for the entire game.',
        steps: [
          {
            instruction: 'Develop your light-squared bishop to c4, aiming at black’s weak f7 square.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Bc4'],
            hint: 'Slide the bishop from f1 diagonally to c4.',
            explanation: 'Superb! Bc4 sets up the Italian Game and puts immediate pressure on black’s vulnerable f7 pawn.',
          },
        ],
      },
      {
        id: 'l1-rook',
        levelId: 1,
        title: 'The Rook: The Heavy Fortress',
        subtitle: 'Moving straight along ranks and files',
        description:
          'Rooks move in straight horizontal and vertical lines across open ranks and files. Worth 5 points of material, rooks excel in the endgame and on open files where nothing blocks their path.',
        steps: [
          {
            instruction: 'Slide your rook down the open e-file to deliver check on e8.',
            fen: '4k3/8/8/8/8/8/8/4R1K1 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Re8+'],
            hint: 'Move the rook from e1 all the way to e8.',
            explanation: 'Check! Rooks dominate open files and can cut off entire ranks or files from the enemy king.',
          },
        ],
      },
      {
        id: 'l1-queen',
        levelId: 1,
        title: 'The Queen: Supreme Power',
        subtitle: 'Combining rook and bishop movement',
        description:
          'The queen is the most powerful attacking piece on the board, worth 9 points! She can move any number of unobstructed squares in any direction: horizontally, vertically, or diagonally.',
        steps: [
          {
            instruction: 'Deliver checkmate on f7 with your queen, supported by the bishop.',
            fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Qxf7#'],
            hint: 'Capture the pawn on f7 with your queen.',
            explanation: 'Checkmate! The famous Scholar’s Mate demonstrates the devastating coordination of queen and bishop.',
          },
        ],
      },
      {
        id: 'l1-king',
        levelId: 1,
        title: 'The King: The Heart of the Army',
        subtitle: 'One square in any direction; must be guarded',
        description:
          'The king can step one square in any direction. While slow in the opening, the king cannot be captured! If your king is trapped in check with no escape, the game is lost.',
        steps: [
          {
            instruction: 'Step your king to e2 to activate it in this king-and-pawn endgame.',
            fen: '8/8/8/8/4k3/8/4K3/8 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Kd2', 'Kf2', 'Kd1'],
            hint: 'Step your king forward or sideways to maintain opposition.',
            explanation: 'Great move! In endgames, an active king is worth about 4 points of fighting power.',
          },
        ],
      },
      {
        id: 'l1-check-mate',
        levelId: 1,
        title: 'Check vs. Checkmate',
        subtitle: 'The three ways to escape check: CPR',
        description:
          'When a king is attacked, it is in "Check". You must escape immediately using CPR: Capture the attacking piece, Protect by blocking with another piece, or Run away with the king. If no legal move can escape check, it is Checkmate and the game ends!',
        steps: [
          {
            instruction: 'White’s king is in check from Black’s queen on h4. Block the check by pushing g3.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['g3', 'Nf3', 'Qe2'],
            hint: 'Push g3 to interpose between the queen and your king.',
            explanation: 'Well defended! Blocking with a pawn forces Black’s queen to retreat.',
          },
        ],
      },
      {
        id: 'l1-stalemate',
        levelId: 1,
        title: 'Stalemate: The Tragic Draw',
        subtitle: 'No legal moves and NOT in check',
        description:
          'Stalemate occurs when the player whose turn it is has NO legal moves available, but their king is NOT currently in check! In chess, stalemate is an immediate draw (1/2 - 1/2), allowing losing players to perform miracle swindles.',
        steps: [
          {
            instruction: 'Do NOT stalemate! Deliver checkmate on g7 instead of taking all squares.',
            fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Qg7#', 'Qf8#'],
            hint: 'Play Qg7# or Qf8# to deliver checkmate, not a careless waiting move.',
            explanation: 'Checkmate! Always make sure your winning moves deliver check so you never accidentally stalemate your opponent.',
          },
        ],
      },
      {
        id: 'l1-castling',
        levelId: 1,
        title: 'Castling: King Safety & Rook Activation',
        subtitle: 'The only move where two pieces move at once',
        description:
          'Castling tucks your king into a safe corner and brings your rook into the center. The king steps two squares toward the rook, and the rook hops over to the adjacent square. You cannot castle if your king has moved, if the rook has moved, if squares between them are occupied, or if your king is in check or crosses a square under enemy attack.',
        steps: [
          {
            instruction: 'Castle kingside (O-O) by moving your king two squares to g1.',
            fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['O-O'],
            hint: 'Move your king from e1 to g1. The rook will automatically leap to f1.',
            explanation: 'Castling accomplished! Your king is safely sheltered behind pawns, and your rook is ready for action.',
          },
        ],
      },
      {
        id: 'l1-en-passant',
        levelId: 1,
        title: 'En Passant & Pawn Promotion',
        subtitle: 'Special pawn maneuvers',
        description:
          'En Passant ("in passing"): If an enemy pawn leaps two squares forward from its starting rank and lands directly beside your pawn on the 5th rank, you can capture it diagonally behind as if it had only moved one square (must be done immediately on that turn!). Promotion: When a pawn reaches the 8th rank, it transforms instantly into a Queen, Rook, Bishop, or Knight!',
        steps: [
          {
            instruction: 'Promote your pawn on e7 by pushing it to e8 and selecting a Queen.',
            fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['e8=Q+'],
            hint: 'Push the pawn from e7 to e8 and choose the Queen.',
            explanation: 'Promoted to Queen with check! Turning a humble foot soldier into the most powerful piece wins endgames.',
          },
        ],
      },
      {
        id: 'l1-piece-values',
        levelId: 1,
        title: 'Piece Values & Notation',
        subtitle: 'Point values and algebraic language',
        description:
          'Relative piece values guide trades: Pawn = 1 point, Knight = 3 points, Bishop = 3 points, Rook = 5 points, Queen = 9 points, King = Infinite! Algebraic notation records games: K=King, Q=Queen, R=Rook, B=Bishop, N=Knight (no letter for pawns). Captures use "x", check uses "+", checkmate uses "#".',
        steps: [
          {
            instruction: 'Play the move recorded in notation as "Nf3".',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Nf3'],
            hint: 'Move the knight from g1 to f3.',
            explanation: 'Perfect! "Nf3" means Knight moves to f3. You now speak the universal language of chess.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1-1',
        question: 'Which piece can jump over other pieces on the board?',
        options: ['The Bishop', 'The Knight', 'The Pawn', 'The Rook'],
        correctIndex: 1,
        explanation: 'Only the Knight moves in an L-shape and can jump over friendly and enemy pieces.',
      },
      {
        id: 'q1-2',
        question: 'What is the point value of a Rook?',
        options: ['1 point', '3 points', '5 points', '9 points'],
        correctIndex: 2,
        explanation: 'A Rook is worth 5 points, making it a major/heavy piece alongside the Queen.',
      },
      {
        id: 'q1-3',
        question: 'What happens if a player has no legal moves and their king is NOT in check?',
        options: ['They lose immediately', 'Stalemate (Draw)', 'They get 1 minute extra time', 'The opponent gets 2 moves'],
        correctIndex: 1,
        explanation: 'Stalemate results in an immediate draw, splitting the point 1/2 - 1/2.',
      },
      {
        id: 'q1-4',
        question: 'Can a king castle out of check?',
        options: ['Yes, always', 'No, never while in check', 'Only if castling queenside', 'Only once per game'],
        correctIndex: 1,
        explanation: 'You cannot castle while currently in check, nor can the king pass through check.',
      },
    ],
  },
  {
    id: 2,
    title: 'Level 2: Fundamentals',
    subtitle: 'Opening principles, piece coordination, and fundamental checkmates.',
    badge: 'Core Skills',
    description:
      'Learn how Grandmasters navigate the opening, maintain central supremacy, develop pieces smoothly, and reliably execute the basic checkmates that win every endgame.',
    lessons: [
      {
        id: 'l2-opening-principles',
        levelId: 2,
        title: 'The Golden Opening Principles',
        subtitle: 'Center, development, king safety',
        description:
          'Every opening move should aim for three fundamental goals: 1. Control the center squares (e4, d4, e5, d5), 2. Develop minor pieces (knights and bishops) toward active squares, 3. Castle early to protect your king.',
        steps: [
          {
            instruction: 'Stake your claim in the center by moving the king’s pawn two squares.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['e4', 'd4'],
            hint: 'Play e4 or d4 to establish immediate central influence.',
            explanation: 'Opening with e4 controls d5 and f5 and opens diagonal paths for your queen and bishop.',
          },
        ],
      },
      {
        id: 'l2-controlling-center',
        levelId: 2,
        title: 'Occupying the Center',
        subtitle: 'Why the four center squares govern the board',
        description:
          'Pieces placed in or controlling the center control far more squares than pieces on the rim. For example, a knight in the center controls 8 squares, while a knight on the rim controls only 4 ("a knight on the rim is dim").',
        steps: [
          {
            instruction: 'Build the classical pawn center by playing d4.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['d4', 'Nf3'],
            hint: 'Play d4 to challenge black’s pawn on e5.',
            explanation: 'Strong move! Striking at the center challenges Black to defend or concede central space.',
          },
        ],
      },
      {
        id: 'l2-development',
        levelId: 2,
        title: 'Knights Before Bishops',
        subtitle: 'Efficient piece mobilization',
        description:
          'Develop your knights before bishops in general, because knights usually have obvious natural squares (c3 and f3 for white), whereas bishops depend on the emerging pawn structure. Don’t move the same piece multiple times in the opening unless necessary!',
        steps: [
          {
            instruction: 'Develop your queen’s knight to c3 to guard e4 and fight for d5.',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Nc3', 'Bc4', 'Bb5'],
            hint: 'Bring your knight on b1 to c3.',
            explanation: 'Excellent coordination! Both knights are actively influencing the four central squares.',
          },
        ],
      },
      {
        id: 'l2-ladder-mate',
        levelId: 2,
        title: 'The Ladder Checkmate (Two Rooks)',
        subtitle: 'Rolling rooks to push the king to the edge',
        description:
          'With two rooks (or a queen and rook), you can checkmate the enemy king easily using the "lawnmower" or "ladder" technique: one rook guards the escape rank, while the second rook delivers check to push the king one rank back.',
        steps: [
          {
            instruction: 'Deliver checkmate with the second rook on a8.',
            fen: '4k3/R7/8/8/8/8/8/1R4K1 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Rb8#'],
            hint: 'Slide the b1 rook all the way to b8!',
            explanation: 'Checkmate! The rook on a7 cuts off the 7th rank, while the rook on b8 takes away the 8th rank.',
          },
        ],
      },
      {
        id: 'l2-queen-king-mate',
        levelId: 2,
        title: 'Queen & King Checkmate',
        subtitle: 'The "box" technique',
        description:
          'To checkmate with a Queen and King: Use the Queen to construct a shrinking box around the enemy king without stalemating. Once the enemy king is driven to the edge, march your king forward to provide backup, then deliver checkmate face-to-face (the kiss of death).',
        steps: [
          {
            instruction: 'Deliver face-to-face checkmate with the Queen on g7, backed by your King.',
            fen: '6k1/8/6K1/5Q2/8/8/8/8 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Qg7#', 'Qf7#'],
            hint: 'Move the queen to g7 or f7 with king support.',
            explanation: 'Checkmate! The Queen delivers the fatal blow directly in front of the enemy king.',
          },
        ],
      },
      {
        id: 'l2-rook-king-mate',
        levelId: 2,
        title: 'Single Rook & King Checkmate',
        subtitle: 'Opposition and cutoff',
        description:
          'A lone rook cannot checkmate a king without its own king’s direct help. Push the enemy king to an edge rank by cutting off files/ranks, align your king directly opposite (opposition), and deliver check to drive them back.',
        steps: [
          {
            instruction: 'Deliver checkmate along the back rank with Rh8#.',
            fen: '4k3/4R3/4K3/8/8/8/8/8 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Rh7', 'Ra7', 'Rb7', 'Rd7'],
            hint: 'Make a waiting move with your rook to force the black king into opposition.',
            explanation: 'Patient technique! Waiting moves force the opponent to step into direct opposition.',
          },
        ],
      },
      {
        id: 'l2-passed-pawn',
        levelId: 2,
        title: 'Passed Pawns & The Square Rule',
        subtitle: 'Can the enemy king catch your runner?',
        description:
          'A passed pawn has no opposing pawns in front of it or on adjacent files to stop its march. The "Rule of the Square" lets you calculate instantly if the defender can catch the pawn: draw a square from the pawn to its promotion square. If the defending king cannot step inside the square on their turn, the pawn promotes guaranteed!',
        steps: [
          {
            instruction: 'Push your passed pawn toward promotion with a5.',
            fen: '8/8/8/8/P7/8/4k3/4K3 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['a5'],
            hint: 'Push the pawn on a4 forward to a5.',
            explanation: 'Unstoppable! The black king is outside the square and cannot prevent promotion.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q2-1',
        question: 'Why is bringing the Queen out on move 2 generally considered bad for beginners?',
        options: [
          'The Queen is too slow',
          'The Queen can be attacked by developing minor pieces, losing precious tempos',
          'The Queen cannot move backwards',
          'It is illegal in FIDE tournament rules',
        ],
        correctIndex: 1,
        explanation: 'Early queen attacks allow the opponent to develop knights and bishops while chasing your queen.',
      },
      {
        id: 'q2-2',
        question: 'What is a passed pawn?',
        options: [
          'A pawn that has been captured en passant',
          'A pawn with no opposing pawns in front or on adjacent files blocking its march',
          'A pawn that can only move one square',
          'A pawn on the starting rank',
        ],
        correctIndex: 1,
        explanation: 'Passed pawns have a clear runway to become queens and are high-priority assets in endgames.',
      },
      {
        id: 'q2-3',
        question: 'In the Two-Rook ladder checkmate, what is the role of the first rook?',
        options: [
          'To protect the friendly king',
          'To cut off the escape rank so the king cannot step forward',
          'To sacrifice itself',
          'To capture all pawns',
        ],
        correctIndex: 1,
        explanation: 'One rook acts as a barrier along the rank while the second rook delivers the checking blow.',
      },
    ],
  },
  {
    id: 3,
    title: 'Level 3: Tactical Arsenal',
    subtitle: 'Forks, pins, skewers, discovered attacks, and classical mating patterns.',
    badge: 'Tactician',
    description:
      'Chess games are decided by tactics! Learn how to exploit undefended pieces and uncoordinated armies using forks, absolute pins, skewers, discovered checks, deflections, and famous mating patterns.',
    lessons: [
      {
        id: 'l3-fork',
        levelId: 3,
        title: 'The Fork: Attacking Two at Once',
        subtitle: 'The deadly double attack',
        description:
          'A fork occurs when a single piece attacks two or more enemy pieces simultaneously. Knights are legendary for forks because of their leaping ability, and royal forks (attacking King and Queen) are decisive game-winners.',
        steps: [
          {
            instruction: 'Fork the black King on e8 and Rook on a8 by playing Nc7+.',
            fen: 'r3k3/8/8/8/4N3/8/8/4K3 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Nc7+'],
            hint: 'Jump your knight to c7 with check.',
            explanation: 'Boom! Nc7+ delivers check to the king and targets the rook on a8 simultaneously.',
          },
        ],
      },
      {
        id: 'l3-pin',
        levelId: 3,
        title: 'The Pin: Paralyzing Enemy Pieces',
        subtitle: 'Absolute vs. Relative Pins',
        description:
          'A pin happens when an attacking piece threatens a target behind an enemy piece. An "Absolute Pin" pins a piece to the King (it is literally illegal to move the pinned piece). A "Relative Pin" pins to a higher-value piece like the Queen.',
        steps: [
          {
            instruction: 'Pin the black knight to its king by playing Bb5.',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['Bb5'],
            hint: 'Move your light-squared bishop to b5.',
            explanation: 'The Ruy Lopez pin! The knight on c6 is absolutely pinned to the king on e8 and cannot move.',
          },
        ],
      },
      {
        id: 'l3-skewer',
        levelId: 3,
        title: 'The Skewer: The X-Ray Attack',
        subtitle: 'Attacking through the valuable front piece',
        description:
          'A skewer is the inverse of a pin: the more valuable piece is in FRONT, and when it is forced to move out of the line of fire, the piece behind it is captured!',
        steps: [
          {
            instruction: 'Deliver a skewer with Bg5+, forcing Black’s King to move and exposing the Queen on d8.',
            fen: '3qk3/8/8/8/8/8/8/4K1B1 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Bh4+', 'Bf2+'],
            hint: 'Put the king in check along the diagonal.',
            explanation: 'Devastating skewer! When the king runs, the queen on d8 is lost.',
          },
        ],
      },
      {
        id: 'l3-discovered-attack',
        levelId: 3,
        title: 'Discovered Attacks & Checks',
        subtitle: 'Unmasking a hidden laser',
        description:
          'A discovered attack happens when one piece moves out of the way, unmasking a devastating attack from a friendly piece behind it (like a rook or bishop). The moving piece can attack another target simultaneously!',
        steps: [
          {
            instruction: 'Unmask a discovered check on Black’s King by moving your knight to d6.',
            fen: 'r1bqkb1r/pppp1ppp/2n5/4P3/3Pn3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1',
            playerColor: 'w',
            expectedMoves: ['d5', 'Be2', 'Bd3'],
            hint: 'Move a central piece to reveal the queen or bishop’s pressure.',
            explanation: 'Brilliant! Discovered attacks leave opponents helpless because they must deal with two threats at once.',
          },
        ],
      },
      {
        id: 'l3-double-check',
        levelId: 3,
        title: 'The Double Check: Panic on the Board',
        subtitle: 'The king’s only legal option is to run',
        description:
          'A double check occurs when two pieces check the enemy king simultaneously on the same move. Because no piece can capture two attackers at once or block two lines of fire at once, the king MUST move!',
        steps: [
          {
            instruction: 'Deliver double check and mate with Nf7#.',
            fen: '6k1/5ppp/8/8/8/8/5N2/4R1K1 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Re8#'],
            hint: 'Slide your rook to the back rank.',
            explanation: 'Back rank mate! Double checks and back rank weaknesses dismantle unprepared defenses.',
          },
        ],
      },
      {
        id: 'l3-smothered-mate',
        levelId: 3,
        title: 'Smothered Mate: Philidor’s Legacy',
        subtitle: 'Suffocated by friendly pieces',
        description:
          'In a smothered mate, a single knight delivers checkmate to a king that is completely surrounded and suffocated by its own friendly pieces, leaving it with zero escape squares.',
        steps: [
          {
            instruction: 'Deliver smothered mate with Nf7#!',
            fen: '6rk/6pp/7N/8/8/8/8/4K3 w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Nf7#'],
            hint: 'Jump the knight to f7.',
            explanation: 'Smothered Mate! The black king cannot escape because its own rook and pawns block every square.',
          },
        ],
      },
      {
        id: 'l3-arabian-mate',
        levelId: 3,
        title: 'The Arabian Mate',
        subtitle: 'The timeless dance of Rook and Knight',
        description:
          'Known for over a thousand years, the Arabian Mate pairs a knight on the 6th rank (e.g. f6) defending a rook on the corner square (h8), while cutting off the king’s escape routes.',
        steps: [
          {
            instruction: 'Deliver Arabian Mate with Rh7# or Rh8#!',
            fen: '7k/5N2/8/8/8/8/8/4K2R w - - 0 1',
            playerColor: 'w',
            expectedMoves: ['Rh8#'],
            hint: 'Slide the rook to h8, protected by the knight on f7.',
            explanation: 'Arabian Mate! The knight guards the rook and blocks the king from escaping.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q3-1',
        question: 'What is the key difference between a pin and a skewer?',
        options: [
          'A pin can only be done by pawns',
          'In a skewer, the more valuable piece is in front, forcing it to move and exposing the piece behind it',
          'A skewer is always an illegal move',
          'A pin only attacks the king',
        ],
        correctIndex: 1,
        explanation: 'In a pin, the weaker piece shields the stronger one; in a skewer, the stronger piece is in front.',
      },
      {
        id: 'q3-2',
        question: 'When placed in double check, how can a player defend?',
        options: [
          'Capture the checking piece',
          'Block the check with a knight',
          'The king MUST move to a safe square; blocking or capturing is impossible against two pieces at once',
          'Castle out of check',
        ],
        correctIndex: 2,
        explanation: 'A double check forces the king to run because you cannot block or capture two separate threats in one turn.',
      },
      {
        id: 'q3-3',
        question: 'Which piece delivers the final checkmate in a Smothered Mate?',
        options: ['The Queen', 'The Bishop', 'The Knight', 'The Pawn'],
        correctIndex: 2,
        explanation: 'Only the Knight can leap over the surrounding pieces to deliver checkmate to a suffocated king.',
      },
    ],
  },
  {
    id: 4,
    title: 'Level 4: Positional Strategy',
    subtitle: 'Pawn structures, outposts, weak squares, and prophylactic thinking.',
    badge: 'Strategist',
    description:
      'Master the art of long-term planning: identifying weak squares and holes, establishing eternal outposts for your knights, understanding good vs bad bishops, pawn storms, and Karpovian prophylaxis.',
    lessons: [],
    quiz: [],
  },
  {
    id: 5,
    title: 'Level 5: Master Endgames',
    subtitle: 'Lucena bridge, Philidor defense, opposition, and fortress techniques.',
    badge: 'Endgame Wizard',
    description:
      'The definitive endgame manual: mastering the Lucena Position (the bridge technique), the Philidor Defense (passive rook cutoff), triking pawn breakthroughs, and setting unassailable fortresses.',
    lessons: [],
    quiz: [],
  },
  {
    id: 6,
    title: 'Level 6: Advanced Mastery',
    subtitle: 'Candidate moves, calculation trees, and immortal masterpieces.',
    badge: 'Master',
    description:
      'Grandmaster calculation protocols: Kotov’s candidate move trees, prophylactic safety checks, imbalance evaluation, and in-depth study of the Immortal Game and Opera House masterpiece.',
    lessons: [],
    quiz: [],
  },
];
