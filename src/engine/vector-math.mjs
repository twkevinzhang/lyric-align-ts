// Numeric helpers adapted from Echogarden 3.4.0 (MIT, see THIRD_PARTY_NOTICES.md): only the functions the aligner calls.
export function meanOfVector(vector) {
    if (vector.length == 0) {
        return 0;
    }
    return sumVector(vector) / vector.length;
}

export function medianOfVector(vector) {
    if (vector.length == 0) {
        throw new Error('Vector is empty');
    }
    const sortedArray = Array.from(vector).sort((a, b) => a - b);
    const median = sortedArray[Math.floor(sortedArray.length / 2)];
    return median;
}

export function sumVector(vector) {
    const elementCount = vector.length;
    let result = 0.0;
    for (let i = 0; i < elementCount; i++) {
        result += vector[i];
    }
    return result;
}

export function sumAndSumOfSquaresOfVector(vector) {
    const elementCount = vector.length;
    let sum = 0.0;
    let sumOfSquares = 0.0;
    for (let i = 0; i < elementCount; i++) {
        const value = vector[i];
        sum += value;
        sumOfSquares += value ** 2;
    }
    return { sum, sumOfSquares };
}

export function maxValue(vector) {
    return vector[indexOfMax(vector)];
}

export function indexOfMax(vector) {
    if (vector.length == 0) {
        return -1;
    }
    let maxValue = vector[0];
    let result = 0;
    for (let i = 1; i < vector.length; i++) {
        if (vector[i] > maxValue) {
            maxValue = vector[i];
            result = i;
        }
    }
    return result;
}

export function softmax(logits, temperature = 1.0) {
    const logitCount = logits.length;
    if (logitCount === 0) {
        return new Float32Array(0);
    }
    let maxLogit = -Infinity;
    for (let i = 0; i < logitCount; i++) {
        const value = logits[i];
        if (value > maxLogit) {
            maxLogit = value;
        }
    }
    temperature = Math.max(temperature, 1e-5);
    const temperatureReciprocal = 1 / temperature;
    const results = new Float32Array(logitCount);
    let sumOfExponentiatedLogits = 0.0;
    for (let i = 0; i < logitCount; i++) {
        const logit = logits[i];
        const normalizedLogit = (logit - maxLogit) * temperatureReciprocal;
        const eToLogit = Math.exp(normalizedLogit);
        sumOfExponentiatedLogits += eToLogit;
        results[i] = eToLogit;
    }
    const sumOfExponentiatedValuesReciprocal = 1 / (sumOfExponentiatedLogits + 1e-20);
    for (let i = 0; i < logitCount; i++) {
        results[i] *= sumOfExponentiatedValuesReciprocal;
    }
    return results;
}

export function medianOf5Filter(points) {
    // This function computes the moving median with a window of 5 elements.
    // I initialized the window such that at the edges of the range no median would be computed.
    // This is a form of optimization assuming that computing a median edge points
    // is less important.
    const pointCount = points.length;
    if (pointCount < 5) {
        return Float32Array.from(points);
    }
    const medians = new Float32Array(pointCount);
    medians[0] = points[0];
    medians[1] = points[1];
    medians[pointCount - 2] = points[pointCount - 2];
    medians[pointCount - 1] = points[pointCount - 1];
    for (let i = 2; i < pointCount - 2; i++) {
        medians[i] = medianOf5(points[i - 2], points[i - 1], points[i], points[i + 1], points[i + 2]);
    }
    return medians;
}

export function medianOf5(a, b, c, d, e) {
    // These swapping computation should be faster than separately using the minimum and maximum
    // functions but maybe less readable.
    // Ensure b is greater or equal to a (swap if needed)
    if (b < a) {
        [a, b] = [b, a];
    }
    // Ensure d is greater or equal to c (swap if needed)
    if (d < c) {
        [c, d] = [d, c];
    }
    // What this part does is compute the two middle medians of the first 4 elements
    // given to the function (a, b, c, d), but it doesn't actually determine their relative order:
    const firstMedianOfABCD = Math.max(a, c); // First median of a, b, c, d
    const secondMedianOfABCD = Math.min(b, d); // Second median of a, b, c, d
    // Now in relation to all five numbers, the median can only be either
    // the first median of ABCD, the second median of ABCD, or E:
    return medianOf3(firstMedianOfABCD, secondMedianOfABCD, e);
}

export function medianOf3(a, b, c) {
    // This function uses a decision tree to find the median of three numbers.
    //
    // I tried to ensure that the comparison preserved the natural altering of
    // a, b and c such that in case that they are given already in order,
    // then all the initial branches would be directly taken.
    // Possible orderings:
    //
    // a, b, c
    // a, c, b
    // b, a, c
    // b, c, a
    // c, a, b
    // c, b, a
    if (a <= b) {
        if (b <= c) {
            return b; // a, b, c
        }
        else if (a <= c) {
            return c; // a, c, b
        }
        else {
            return a; // c, a, b
        }
    }
    else {
        if (a <= c) {
            return a; // b, a, c
        }
        else if (b <= c) {
            return c; // b, c, a
        }
        else {
            return b; // c, b, a
        }
    }
}
//# sourceMappingURL=MedianFilter.js.map
