# Code Lab (C#) — teaching notes

The interface uses English so students meet the same keywords, types and compiler messages they will see in Visual Studio and Unity. The drone's world uses Unity's axes: X right, Z forward, Y up.

## How to use it in class

- Start each concept with **Step (F10)**, not Run. Ask students to predict what the next line will do before pressing Step.
- Point at three places while stepping: the highlighted line (what runs next), **Memory** (what the computer remembers) and the **Execution** panel (how a condition was evaluated).
- After a run, read the **×** counters next to the line numbers: how many times did the loop body run? How many times was the condition checked? (One more than the body.)
- Errors are part of the lesson. The compiler checks everything before running: a program with an error does nothing at all. Runtime errors happen while running and stop at a specific line.

## Challenge types

The sequence follows how beginners learn: read and predict before writing (PRIMM: Predict, Run, Investigate, Modify, Make).

- **Observe ◉** — read-only. Follow it with Step; nothing to write.
- **Predict ?** — choose an answer, then run. A wrong prediction still completes the challenge: the surprise is the lesson. Ask students to explain the difference out loud.
- **Order ⇅** (Parsons problems) — the correct lines are given, shuffled, with one or two traps. Students practise logic without fighting syntax.
- **Fix !** — compiler errors and logic errors (the program runs but does the wrong thing).
- **Complete _** — fill in the `___` gaps of a worked example.
- **Classify ≡** — choose a category for each item (valid name? works or error?). The compiler, or a naming rule, decides.
- **Create ■** — write the program.

## Level 0 · Calculator (no statements yet)

Each line is a single calculation, without `;` or method calls, like C# Interactive. The result appears next to the line with its type; in some challenges the drone builds it as a tower. This keeps the very first contact free of syntax.

1. **The calculator** (observe) — one line at a time, top to bottom; comments.
2. **Which goes first?** (predict) — `2 + 3 * 4` is 14.
3. **Make 12** (create) — only the numbers 3 and 4 are allowed; several answers work.
4. **Fill the gaps** (complete).
5. **Whole numbers** (predict) — `7 / 2` is 3; try `7.0 / 2`.
6. **What is left over** (predict) — `17 % 5` is 2.
7. **Kinds of values** (predict) — int, double, string, bool; `"3" + 4` is `"34"`.

## Level 1 · Names

1. **Capital letters matter** (classify) — `true`/`True`, double quotes, decimal point, `Math`/`math`. The real checker decides.
2. **Valid names** (classify) — digits first, spaces, `-`, reserved words (`class` is invalid, `Class` is valid).
3. **Name styles** (classify) — camelCase for variables, PascalCase for methods and types.
4. **A box with a name** (predict) — `age + 1` calculates, `age = age + 1` stores.
5. **Fix the names** (fix) — spaces in names, `Int`, `playerscore` vs `playerScore`.

## Level 2 · Text

A strip under the scene shows the text as boxes with positions 0, 1, 2… and highlights what each line reads.

1. **A row of characters** (observe) — `Length`, `[0]`, `[4]`, `ToUpper()`.
2. **Counting from zero** (predict) — `word[1]` is the second character.
3. **The last letter** (predict) — the last position is `Length - 1`.
4. **Say hello** (complete) — joining text and a variable with `+`; spaces are characters.
5. **A piece of text** (predict) — `Substring(start, length)`: the second number is a count.
6. **Fill in the template** (create) — interpolation `$"{name} is {age}"`.
7. **Text traps** (fix) — `'Barcelona'` (a char holds one character), `length`, `ToUpper` without brackets.

## Level 3 · Logic

Every bool result lights a lamp (green true, red false) and the panel shows how the expression is reduced, one step at a time.

1. **True or false** (observe) — comparisons give a bool; `==` and `!=`.
2. **Store or compare?** (predict) — `=` stores, `==` compares; the same question can change its answer.
3. **Both at once** (predict) — `&&` needs both sides.
4. **And, or, not** (classify) — `&&`, `||`, `!`; the program itself checks each answer.
5. **Can I ride?** (complete) — turning a rule written in words into code.
6. **Even or odd** (create) — `n % 2 == 0`, using variables, not numbers.
7. **Logic bugs** (fix) — `=>` instead of `>=`, `&` instead of `&&`, wrong capital letter.

## Level 4 · First instructions

Now `;` and method calls appear: `Console.WriteLine("Hello!");` — who (`Console`), what (`WriteLine`), with what (the value in brackets). Then a Parsons problem and the broken calculator (`"2 + 3 = " + 2 + 3`).

## Level 5 · The drone (sequence)

1. **First block** — programs run top to bottom, one instruction at a time. Each `Move` is one tile.
2. **Order matters** — the starter stacks the tower upside down. The computer does exactly what is written.
3. **Read the errors** — three mistakes: a missing `;`, `place` vs `Place`, `green` vs `Green`. Syntax errors appear one at a time; after fixing the `;`, the checker lists the other two together. C# is case-sensitive.

## Level 6 · Variables

- **A box, not an equation** (predict) — `x = x + 1` stores, it is not an equation.
- **A copy, not a link** (predict) — `int b = a;` copies the value; changing `a` later does not change `b`. One of the most common beginner misconceptions.
- **Swap two boxes** (order) — the temp-variable swap, with two trap lines.

1. **Store a value** — change `distance` once and both moves change. Watch the variable box in Memory.
2. **Whole numbers** — `7 / 2` is `3` for `int`. The Console prints `middle = 3`. Discuss `7 / 2.0`, `double` and `(int)` casts. The end tile is `width - 1` (counting from 0).
3. **Types** — `Color roof = "Red";` fails with CS0029: a string is not a Color. Reuse the variables for the second tower and reassign `label` (no type the second time, or CS0128 appears).

## Level 7 · Loops

- **Count the turns** (predict) — `i <= 4` from 0 runs five times (off-by-one).
- **Loop inside a loop** (order, before The floor) — braces are lines too; indentation appears automatically.

1. **The wall** — the three parts of `for`. Try `i < 9`: the drone leaves the grid on line 4 (runtime error) and the Memory panel shows `i` at the moment of the error.
2. **Use the counter** — `MoveTo(i * 2, 0)`: the loop variable is a normal int.
3. **Stairs** — nested loops. In Memory, the inner `h` is created and destroyed on every turn of the outer loop (scope).
4. **The floor** — two nested loops cover a grid: the pattern behind instancing, tiling and procedural placement.
5. **Fill it up** — the starting heights are random. `while (drone.Height < 6)` repeats an unknown number of times. The program is verified on three other random worlds.

## Level 8 · Conditions

- **Which path?** (predict) — an `if / else if / else` chain runs only the first true branch; `&&` needs both sides.

1. **Checkerboard** — `%` and `if/else`. Step through a few tiles and read `(1 + 2) % 2 == 0 → false`.
2. **The frame** — `||` combines conditions. Ask what `&&` would build instead (only the corners? nothing?).
3. **Read the floor** — the floor is random; students must read `drone.Ground` and chain `else if`. Hard-coded positions fail the extra worlds.

## Level 9 · Methods

Methods are written as local functions below the main program (`void Tower(int h) { … }`), which is valid C# without `class Program`. Classes come in the second Code Lab. Inside a method, only its parameters, its own variables and `drone` are visible; using a variable of the main program gives a lab message that suggests passing it as a parameter (the same rule a `static` local function follows, and closer to how methods work in Unity).

- **Step (F10)** runs a whole call in one go; **Step Into (F11)** follows the program inside. After each call the program comes back to the calling line and the Execution panel says what the method gave back.
- **Memory** shows the **call stack**: each call gets its own frame with its parameters, the newest on top; the frames below are waiting at the line that made the call (also marked in blue in the editor). In recursion, one frame per call.
- New compiler checks: CS0161 (not all code paths return a value), CS0127/CS0126 (return with or without a value), CS1501/CS1503 (wrong number or type of arguments), CS0428 (method name without brackets) and the warnings CS8321 (declared but never used) and CS0162 (unreachable code after `return`). Endless recursion stops with a StackOverflowException.

1. **Write once, use many times** (observe) — declare vs call, parameter, frames in Memory.
2. **Written, but never called** (predict) — declaring a method does not run it.
3. **Stop copying** (create) — turn copied code into `House()`; at most 8 instructions.
4. **A copy, not the original** (predict) — a parameter is a copy: two boxes called `lives`, one per frame.
5. **Give it back** (complete) — `int Area(…)` and `return`; the call is replaced by its value.
6. **Printing is not returning** (fix) — `Console.WriteLine` inside a method is not `return` (CS0161), plus a logic mistake.
7. **Build a wall method** (order) — two parameters, `Wall(int length, Color color)`.
8. **A street of houses** (create) — a parameter plus a loop inside the method.

## Level 10 · Arrays

An array variable is drawn in Memory as a row of boxes with their positions underneath; the box read in the current step lights up blue and a box being written lights up yellow. Conditions show the position first and then the value: `h[i] > 5 → h[1] > 5 → 7 > 5 → true`. `foreach` steps show which item comes next (`heights[2] → 6`). Arrays are real references: passing one to a method lets the method change the same boxes (both frames light up). Array assignment between variables (`b = a`) is left for Code Lab 02, with the other references.

1. **A row of boxes** (observe) — `int[] heights = { … }`, positions from 0, `Length`.
2. **Which box?** (predict) — `scores[1]` is the second value.
3. **A skyline with a loop** (complete) — `for` with `i < heights.Length` and `heights[i]`.
4. **One box too far** (fix) — `<=` gives an IndexOutOfRangeException at the exact line, with the position asked for; printing an array prints `System.Int32[]`, not its values.
5. **Empty boxes** (predict) — `new int[4]` starts full of zeros; writing into one box.
6. **Add up and find the tallest** (create) — the sum and the "best so far" patterns; the result must be calculated.
7. **One by one with foreach** (order) — `foreach` reads items in order and cannot change them (CS1656 if you try).
8. **Two streets, one method** (create) — a method with an `int[]` parameter, called for two arrays.

Compiler checks include CS0820 (`var` with `{ … }`), CS0622 (`{ … }` for a non-array), CS0270 (`int[5] a`), CS0029 with a hint when an array is used where one value is expected, CS0200 (`Length` or a string character cannot be assigned), CS1579 (`foreach` over a number) and CS1656.

## Level 11 · From block to city (project)

`drone.Scan()` returns the plan of the row where the drone is as an `int[]` (one number per plot, from x = 0). Every run brings a new plan and each solution is verified on three more random worlds, so students must read the data instead of copying numbers: the idea behind procedural generation in games, films and tools like Houdini or Geometry Nodes.

1. **Read the plan** — `Scan()` + `foreach` + `Build`.
2. **Buildings with roofs** — a `Building(int floors)` method; `0` is an empty plot (the drone still moves).
3. **The whole city** — four streets (`z += 2`), nested loops, a rule that changes the roof color (4 floors or more → Blue).
4. **Terrain from a heightmap** — each row is a heightmap; color every layer by altitude with a method that returns a `Color`; height 0 is water. A good moment to connect with displacement maps and terrain tools in Blender.

## Free build

A sandbox with a pyramid made from three nested loops and the conditional operator. Good for open-ended tasks: a spiral staircase, a hollow tower, a gradient of colors.

## Next levels (planned)

Code Lab 02 (objects, towards Unity) will cover classes and objects, references and `null`, `List<T>` and `foreach`, `struct` vs `class`, `Update()`/`deltaTime` and light inheritance.
